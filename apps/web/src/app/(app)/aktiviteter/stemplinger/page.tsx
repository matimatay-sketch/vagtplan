import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { daypartOf } from "@/lib/domain/daypart";
import { localParts, timeRange, zonedTime } from "@/lib/domain/schedule-time";
import { stampStatus, type StampStatus } from "@/lib/domain/stamp-status";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stemplinger" };

const t = da.activities;
const ORDER: StampStatus[] = ["late", "not_out", "in", "upcoming", "missing", "done"];
const tone: Record<StampStatus, string> = {
  late: "bg-destructive/10 text-destructive",
  not_out: "bg-warning/25 text-warning-foreground",
  in: "bg-success/15 text-success",
  upcoming: "bg-muted text-muted-foreground",
  missing: "bg-destructive/10 text-destructive",
  done: "bg-muted text-muted-foreground",
};

/** Today's shifts in the leader's departments and where they stand with stamping. */
export default async function StampsPage() {
  const ctx = await requireContext([
    "time.view",
    "time.manage",
    "time.approve",
    "schedule.view",
    "schedule.manage",
  ]);
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const from = new Date(zonedTime(today)).toISOString();
  const to = new Date(zonedTime(addDays(today, 1))).toISOString();
  // The rows the leader may see (RLS on registrations; time_overview for the plan).
  const { data: rows } = await supabase.rpc("time_overview", { p_from: from, p_to: to });
  // Today's published shifts with an employee in the departments the leader sees (RLS).
  const { data: planned } = await supabase
    .from("shift")
    .select(
      "id, employee_id, published, employee:employee!shift_organization_id_employee_id_fkey (first_name, last_name), department:department!shift_organization_id_department_id_fkey (name)",
    )
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .not("published", "is", null)
    .not("employee_id", "is", null)
    .gte("start_at", from)
    .lt("start_at", to);
  const now = Date.parse(new Date().toISOString());
  const entries = (rows ?? []).filter((r) => r.row_kind === "entry" && r.employee_id);
  const shifts = (planned ?? []).flatMap((s) => {
    const p = s.published as { employee_id?: string; start_at?: string; end_at?: string } | null;
    return p?.employee_id && p.start_at && p.end_at
      ? [
          {
            id: s.id,
            employee_id: p.employee_id,
            employee_name: s.employee ? `${s.employee.first_name} ${s.employee.last_name}` : "",
            department_name: s.department?.name ?? "",
            start_at: p.start_at,
            end_at: p.end_at,
          },
        ]
      : [];
  });
  const items = shifts.map((s) => {
    const entry =
      entries.find((e) => e.shift_id === s.id) ??
      entries.find(
        (e) =>
          e.employee_id === s.employee_id &&
          Date.parse(e.start_at) < Date.parse(s.end_at) &&
          (!e.end_at || Date.parse(e.end_at) > Date.parse(s.start_at)),
      ) ??
      null;
    return {
      id: s.id,
      name: s.employee_name,
      department: s.department_name,
      start: s.start_at,
      end: s.end_at,
      entryStart: entry?.start_at ?? null,
      status: stampStatus(
        { start: s.start_at, end: s.end_at },
        entry ? { start: entry.start_at, end: entry.end_at } : null,
        now,
      ),
    };
  });
  items.sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.start.localeCompare(b.start),
  );
  const count = (st: StampStatus) => items.filter((x) => x.status === st).length;

  return (
    <>
      <PageHeader title={t.stampsTitle} help={t.stampsHelp} />
      {items.length === 0 ? (
        <EmptyState>{t.noShiftsToday}</EmptyState>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="stamp-counts">
            {(["in", "late", "not_out"] as const).map((st) => (
              <span key={st}>
                <span className="text-lg font-semibold tabular">{count(st)}</span>{" "}
                <span className="text-muted-foreground">{t.counts[st]}</span>
              </span>
            ))}
          </p>
          <ul className="grid gap-2" data-testid="stamp-list">
            {items.map((x) => (
              <li
                key={x.id}
                data-daypart={daypartOf(x.start)}
                data-status={x.status}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-l-(color:--dp) bg-card px-4 py-3"
              >
                <span className="grid">
                  <span className="font-medium">{x.name}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="tabular">{timeRange(x.start, x.end)}</span> · {x.department}
                  </span>
                </span>
                <span className={cn("rounded-full px-3 py-1 text-sm font-medium", tone[x.status])}>
                  {t.status[x.status]}
                  {x.status === "in" && x.entryStart
                    ? ` ${t.since(localParts(x.entryStart).time)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
