import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApprovalTable, type DepartmentRights } from "@/components/time/approval-table";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment, hasAny } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { addDays, isValidIsoDate, todayIn } from "@/lib/domain/civil-date";
import { isoWeekNumber, weekDates, weekStartOf } from "@/lib/domain/schedule-time";
import { loadTimeOverview } from "@/lib/time/load";
import { loadProjectOptions } from "@/lib/time/projects";
import { loadPayPreviews } from "@/lib/payroll/preview";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Godkend tid" };

export default async function ApproveTimePage({ searchParams }: PageProps<"/tid/godkend">) {
  const ctx = await requireContext();
  const approverOf = new Set(ctx.timeApproverOf);
  if (
    !hasAny(ctx.permissions, ["time.view", "time.manage", "time.approve"]) &&
    approverOf.size === 0
  )
    redirect("/oversigt?adgang=nej");
  const sp = await searchParams;
  const t = da.time;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);

  const { data: departments } = await supabase
    .from("department")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  const can = (key: "time.view" | "time.manage" | "time.approve", id: string) =>
    canInDepartment(ctx.permissions, key, id, ctx.responsibleDepartmentIds);
  const visible = (departments ?? []).filter(
    (d) => can("time.view", d.id) || can("time.manage", d.id) || can("time.approve", d.id),
  );
  if (visible.length === 0 && approverOf.size === 0)
    return (
      <>
        <PageHeader title={t.approveTitle} />
        <EmptyState>{da.common.notAllowed}</EmptyState>
      </>
    );
  const rights: DepartmentRights = Object.fromEntries(
    visible.map((d) => [
      d.id,
      { approve: can("time.approve", d.id), manage: can("time.manage", d.id) },
    ]),
  );
  const departmentId = visible.some((d) => d.id === str(sp.afdeling)) ? str(sp.afdeling) : null;
  const weekStart = weekStartOf(isValidIsoDate(str(sp.uge)) ? str(sp.uge) : today);
  const dates = weekDates(weekStart);
  const status = ["pending", "approved", "all"].includes(str(sp.status)) ? str(sp.status) : "all";

  const [overview, projects] = await Promise.all([
    loadTimeOverview(supabase, ctx, { from: weekStart, to: dates[6]!, departmentId }),
    loadProjectOptions(supabase, ctx.organization.id),
  ]);
  const rows = overview.rows.filter(
    (r) =>
      (rights[r.departmentId] || approverOf.has(r.employeeId)) &&
      (status === "all" || r.kind === "missing" || r.status === status),
  );
  // Which pay codes the week activates, per employee (amounts only with payroll rights).
  const previewEmployees = [
    ...new Map(rows.map((r) => [r.employeeId, r.departmentId])).entries(),
  ].map(([id, dept]) => ({
    id,
    showAmounts:
      canInDepartment(ctx.permissions, "payroll.view", dept, ctx.responsibleDepartmentIds) ||
      canInDepartment(ctx.permissions, "payroll.manage", dept, ctx.responsibleDepartmentIds),
  }));
  const previews = await loadPayPreviews(supabase, ctx, previewEmployees, {
    start: weekStart,
    end: dates[6]!,
  });
  const href = (p: Record<string, string>) =>
    `/tid/godkend?${new URLSearchParams({ uge: weekStart, status, ...(departmentId ? { afdeling: departmentId } : {}), ...p })}`;

  return (
    <>
      <PageHeader title={t.approveTitle} lead={t.approveLead} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="uge" value={weekStart} />
          <NativeSelect name="afdeling" defaultValue={departmentId ?? ""} aria-label={t.department}>
            <option value="">{t.allDepartments}</option>
            {visible.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="status" defaultValue={status} aria-label={t.filterStatus}>
            <option value="all">{t.allStatuses}</option>
            <option value="pending">{t.statuses.pending}</option>
            <option value="approved">{t.statuses.approved}</option>
          </NativeSelect>
          <Button type="submit" variant="outline">
            {t.show}
          </Button>
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Forrige uge">
            <Link href={href({ uge: addDays(weekStart, -7) })}>
              <ChevronLeft />
            </Link>
          </Button>
          <span
            className="min-w-20 text-center text-sm font-medium tabular"
            data-testid="week-label"
          >
            {t.week} {isoWeekNumber(weekStart)}
          </span>
          <Button asChild variant="ghost" size="icon" aria-label="Næste uge">
            <Link href={href({ uge: addDays(weekStart, 7) })}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t.noEntries}</EmptyState>
      ) : (
        <ApprovalTable
          rows={rows}
          daily={overview.daily}
          exempt={[...overview.exempt]}
          rights={rights}
          approveOwn={ctx.permissions["time.approve"] === "organization"}
          approverOf={[...approverOf]}
          previews={previews}
          amountsFor={previewEmployees.filter((e) => e.showAmounts).map((e) => e.id)}
          projects={projects}
          dates={dates}
        />
      )}
    </>
  );
}
