import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import type { IsoDate } from "@/lib/domain/civil-date";
import { expenseLines, mileageLines, type ExtraPayLine } from "@/lib/domain/mileage";
import { loadMileageRates } from "@/lib/expenses/load";
import { da } from "@/lib/i18n/da";

type Client = Awaited<ReturnType<typeof createClient>>;
type Values = Record<string, string>;

/**
 * Approved trips and expenses dated in the period, as pay lines. Km driven
 * earlier in the same calendar year count towards the yearly limit.
 * Posting: the item's own values over the employee's and the department's defaults.
 */
export async function loadExpensePayLines(
  supabase: Client,
  ctx: AppContext,
  period: { start: IsoDate; end: IsoDate },
  employeeId: string,
): Promise<{ lines: ExtraPayLine[]; notes: { code: string; message: string }[] }> {
  const yearStart = `${period.start.slice(0, 4)}-01-01`;
  const [{ data: trips }, { data: expenses }, rates, { data: employee }] = await Promise.all([
    supabase
      .from("mileage_trip")
      .select("id, trip_date, meters, department_id, posting_values, status")
      .eq("employee_id", employeeId)
      .is("archived_at", null)
      .in("status", ["approved", "pending"])
      .gte("trip_date", yearStart)
      .lte("trip_date", period.end),
    supabase
      .from("expense")
      .select(
        "id, amount_ore, department_id, posting_values, status, expense_category!expense_organization_id_category_id_fkey (name, pay_code)",
      )
      .eq("employee_id", employeeId)
      .is("archived_at", null)
      .in("status", ["approved", "pending"])
      .gte("expense_date", period.start)
      .lte("expense_date", period.end),
    loadMileageRates(supabase, ctx.organization.id),
    supabase.from("employee").select("posting_defaults").eq("id", employeeId).maybeSingle(),
  ]);
  const departmentIds = [
    ...new Set([...(trips ?? []), ...(expenses ?? [])].map((x) => x.department_id)),
  ];
  const { data: departments } = departmentIds.length
    ? await supabase.from("department").select("id, posting_defaults").in("id", departmentIds)
    : { data: [] as { id: string; posting_defaults: unknown }[] };
  const deptDefaults = new Map(
    (departments ?? []).map((d) => [d.id, (d.posting_defaults ?? {}) as Values]),
  );
  const employeeDefaults = (employee?.posting_defaults ?? {}) as Values;
  const posting = (departmentId: string, own: unknown): Values => ({
    ...(deptDefaults.get(departmentId) ?? {}),
    ...employeeDefaults,
    ...((own ?? {}) as Values),
  });

  const approvedTrips = (trips ?? []).filter((t) => t.status === "approved");
  const before: Record<number, number> = {};
  for (const t of approvedTrips)
    if (t.trip_date < period.start) {
      const y = Number(t.trip_date.slice(0, 4));
      before[y] = (before[y] ?? 0) + t.meters;
    }
  const mileage = mileageLines(
    approvedTrips
      .filter((t) => t.trip_date >= period.start)
      .map((t) => ({
        id: t.id,
        date: t.trip_date,
        meters: t.meters,
        posting: posting(t.department_id, t.posting_values),
      })),
    before,
    rates,
  );
  const lines = [
    ...mileage.lines,
    ...expenseLines(
      (expenses ?? [])
        .filter((e) => e.status === "approved" && e.expense_category)
        .map((e) => ({
          id: e.id,
          payCode: e.expense_category!.pay_code,
          label: e.expense_category!.name,
          amountOre: e.amount_ore,
          posting: posting(e.department_id, e.posting_values),
        })),
    ),
  ];
  const t = da.expenses;
  const notes = mileage.missingYears.map((y) => ({
    code: "MILEAGE_RATE_MISSING",
    message: t.noteRateMissing(y),
  }));
  const pending =
    (trips ?? []).filter((x) => x.status === "pending" && x.trip_date >= period.start).length +
    (expenses ?? []).filter((x) => x.status === "pending").length;
  if (pending > 0) notes.push({ code: "EXPENSES_PENDING", message: t.notePending(pending) });
  return { lines, notes };
}
