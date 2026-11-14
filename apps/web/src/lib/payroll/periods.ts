import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { addDays, todayIn, type IsoDate } from "@/lib/domain/civil-date";
import { payPeriodsFrom, type PayPeriodGroupSpec } from "@/lib/domain/pay-periods";
import { hasOrg } from "@/lib/permissions";

type Client = Awaited<ReturnType<typeof createClient>>;

export type PeriodRow = {
  id: string;
  groupId: string;
  groupName: string;
  start: IsoDate;
  end: IsoDate;
  status: "open" | "closed";
  closedAt: string | null;
};

/**
 * Pay periods around today for every pay period group. Missing periods are
 * created (payroll.manage); the database refuses everyone else.
 */
export async function loadPeriods(supabase: Client, ctx: AppContext): Promise<PeriodRow[]> {
  const { data: groups } = await supabase
    .from("pay_period_group")
    .select("id, name, frequency, anchor_date, month_start_day")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  const today = todayIn(ctx.organization.timezone);
  if (hasOrg(ctx.permissions, "payroll.manage")) {
    const wanted = (groups ?? []).flatMap((g) =>
      payPeriodsFrom(g as unknown as PayPeriodGroupSpec, addDays(today, -100), 6).map((p) => ({
        organization_id: ctx.organization.id,
        group_id: g.id,
        start_date: p.start,
        end_date: p.end,
      })),
    );
    if (wanted.length)
      await supabase
        .from("pay_period")
        .upsert(wanted, { onConflict: "group_id,start_date", ignoreDuplicates: true });
  }
  const { data: periods } = await supabase
    .from("pay_period")
    .select("id, group_id, start_date, end_date, status, closed_at")
    .eq("organization_id", ctx.organization.id)
    .order("start_date", { ascending: false });
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  return (periods ?? [])
    .filter((p) => groupName.has(p.group_id))
    .map((p) => ({
      id: p.id,
      groupId: p.group_id,
      groupName: groupName.get(p.group_id)!,
      start: p.start_date,
      end: p.end_date,
      status: p.status,
      closedAt: p.closed_at,
    }));
}

/** Employees with a contract in the period's pay period group. */
export async function employeesInPeriod(
  supabase: Client,
  period: { groupId: string; start: IsoDate; end: IsoDate },
): Promise<{ id: string; name: string; number: string }[]> {
  const { data } = await supabase
    .from("contract")
    .select(
      "employee_id, valid_from, valid_to, employee:employee!contract_organization_id_employee_id_fkey (first_name, last_name, employee_number)",
    )
    .eq("pay_period_group_id", period.groupId)
    .lte("valid_from", period.end)
    .or(`valid_to.is.null,valid_to.gte.${period.start}`);
  const seen = new Map<string, { id: string; name: string; number: string }>();
  for (const c of data ?? [])
    if (c.employee && !seen.has(c.employee_id))
      seen.set(c.employee_id, {
        id: c.employee_id,
        name: `${c.employee.first_name} ${c.employee.last_name}`,
        number: c.employee.employee_number,
      });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "da"));
}
