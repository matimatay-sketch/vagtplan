import "server-only";
import { leaveDays, leaveTypes } from "@vagtplan/rules-engine";
import type { AppContext } from "@/lib/auth";
import { engineInputs } from "@/lib/absence/load";
import { absenceExportRows } from "@/lib/domain/absence-export";
import type { ExportRow } from "@/lib/domain/export";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Approved absence of the employees in a pay period, as export rows: leave
 * days from the rules engine (weekdays without holidays, or planned days), and
 * hours as 1/5 of the contract's weekly norm per day.
 */
export async function loadAbsenceExportRows(
  supabase: Client,
  ctx: AppContext,
  employees: { id: string; name: string; number: string }[],
  period: { start: string; end: string },
): Promise<ExportRow[]> {
  if (employees.length === 0) return [];
  const ids = employees.map((e) => e.id);
  const [{ data: absences }, inputs] = await Promise.all([
    supabase
      .from("absence")
      .select("employee_id, type_code, from_date, to_date")
      .in("employee_id", ids)
      .eq("status", "approved")
      .lte("from_date", period.end)
      .gte("to_date", period.start)
      .order("from_date"),
    engineInputs(supabase, ctx, ids),
  ]);
  const out: ExportRow[] = [];
  for (const e of employees) {
    const input = inputs.get(e.id);
    const own = (absences ?? []).filter((a) => a.employee_id === e.id);
    if (!input || own.length === 0) continue;
    const { data: planned } = await supabase.rpc("planned_work_dates", {
      p_employee_id: e.id,
      p_from: period.start,
      p_to: period.end,
    });
    let labels: Record<string, string> = {};
    try {
      labels = Object.fromEntries(leaveTypes(input, period.start).map((t) => [t.code, t.label]));
    } catch {
      // No agreement version in force: the code is used as text.
    }
    out.push(
      ...absenceExportRows({
        employee: { number: e.number, name: e.name },
        absences: own.map((a) => ({
          code: a.type_code,
          label: labels[a.type_code] ?? a.type_code,
          from: a.from_date,
          to: a.to_date,
        })),
        period,
        daysOf: (from, to) => {
          try {
            return leaveDays(input, from, to, planned ?? []);
          } catch {
            return [];
          }
        },
        minutesOn: (d) => {
          const c = input.contracts.find(
            (x) => x.validFrom <= d && (x.validTo === null || x.validTo >= d),
          );
          return c ? Math.round(c.weeklyNormMinutes / 5) : 0;
        },
      }),
    );
  }
  return out;
}
