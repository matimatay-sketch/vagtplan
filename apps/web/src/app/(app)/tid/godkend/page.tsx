import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
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
import { loadSupplementOptions } from "@/lib/time/supplements";
import { loadExpenseItems } from "@/lib/expenses/load";
import { ExpenseApproval } from "@/components/expenses/expense-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPostingDimensions } from "@/lib/posting/load";
import { loadPayPreviews } from "@/lib/payroll/preview";
import { loadPeriodAbsences } from "@/lib/absence/load";
import { Checkbox } from "@/components/ui/checkbox";
import { headers } from "next/headers";
import { isPhoneRequest } from "@/lib/domain/device";
import { Input } from "@/components/ui/input";
import {
  FLAG_FILTERS,
  countFlags,
  filterTimeRows,
  parseTimeFilters,
  type TimeFilters,
} from "@/lib/domain/time-filters";
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
  const phone = isPhoneRequest(await headers());
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
  const filters = parseTimeFilters(sp);

  const [overview, posting, supplementOptions] = await Promise.all([
    loadTimeOverview(supabase, ctx, { from: weekStart, to: dates[6]!, departmentId }),
    loadPostingDimensions(supabase),
    loadSupplementOptions(supabase, ctx.organization.id),
  ]);
  const accessible = overview.rows.filter(
    (r) => rights[r.departmentId] || approverOf.has(r.employeeId),
  );
  // Which pay codes the week activates, per employee (amounts only with payroll rights).
  const previewEmployees = [
    ...new Map(accessible.map((r) => [r.employeeId, r.departmentId])).entries(),
  ].map(([id, dept]) => ({
    id,
    showAmounts:
      canInDepartment(ctx.permissions, "payroll.view", dept, ctx.responsibleDepartmentIds) ||
      canInDepartment(ctx.permissions, "payroll.manage", dept, ctx.responsibleDepartmentIds),
  }));
  const week = { start: weekStart, end: dates[6]! };
  const [previews, absences, expenseItems] = await Promise.all([
    loadPayPreviews(supabase, ctx, previewEmployees, week),
    loadPeriodAbsences(
      supabase,
      ctx,
      previewEmployees.map((e) => e.id),
      week,
    ),
    loadExpenseItems(supabase, { from: week.start, to: week.end }),
  ]);
  const visibleExpenses = expenseItems.filter(
    (i) =>
      (rights[i.departmentId] || approverOf.has(i.employeeId)) &&
      (!departmentId || i.departmentId === departmentId) &&
      (!filters.query || i.employeeName.toLowerCase().includes(filters.query.toLowerCase())),
  );
  const decidableExpenses = visibleExpenses
    .filter(
      (i) =>
        (rights[i.departmentId]?.approve || approverOf.has(i.employeeId)) &&
        (i.employeeId !== ctx.employee?.id || ctx.permissions["time.approve"] === "organization"),
    )
    .map((i) => `${i.kind}:${i.id}`);
  const filterContext = {
    payCodesByEntry: Object.fromEntries(
      Object.values(previews).flatMap((p) =>
        Object.entries(p.byEntry).map(([id, codes]) => [id, codes.map((c) => c.payCode)]),
      ),
    ),
    absenceTypesByEmployee: absences.byEmployee,
    myEmployees: [...approverOf],
  };
  const rows = filterTimeRows(accessible, filters, filterContext);
  const flagCounts = countFlags(accessible, filterContext);
  const payCodes = [
    ...new Map(
      Object.values(previews)
        .flatMap((p) => p.codes)
        .map((c) => [c.payCode, c.label]),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));
  const absenceCodes = [...new Set(Object.values(absences.byEmployee).flat())].sort();
  const postingValues = posting.flatMap((d) =>
    d.values.map((v) => ({ id: v.id, label: `${d.name}: ${v.code} ${v.name}` })),
  );
  const query = (f: TimeFilters, extra: Record<string, string>) => {
    const q = new URLSearchParams({ uge: weekStart });
    if (departmentId) q.set("afdeling", departmentId);
    if (f.status !== "all") q.set("status", f.status);
    for (const flag of f.flags) q.append("vis", flag);
    if (f.payCode) q.set("loenart", f.payCode);
    if (f.absenceType) q.set("fravaer", f.absenceType);
    if (f.postingValue) q.set("kontering", f.postingValue);
    if (f.query) q.set("q", f.query);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q;
  };
  const href = (p: Record<string, string>) => `/tid/godkend?${query(filters, p)}`;
  const filtered =
    filters.status !== "all" ||
    filters.flags.length > 0 ||
    Boolean(filters.payCode || filters.absenceType || filters.postingValue || filters.query);
  const f = t.filters;

  return (
    <>
      <PageHeader title={t.approveTitle} lead={t.approveLead} />
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <form className="flex w-full flex-col gap-3" data-testid="time-filters">
          <input type="hidden" name="uge" value={weekStart} />
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              name="afdeling"
              defaultValue={departmentId ?? ""}
              aria-label={t.department}
            >
              <option value="">{t.allDepartments}</option>
              {visible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={filters.status} aria-label={t.filterStatus}>
              <option value="all">{t.allStatuses}</option>
              <option value="pending">{f.statuses.pending}</option>
              <option value="approved">{f.statuses.approved}</option>
              <option value="open">{f.statuses.open}</option>
              <option value="missing">{f.statuses.missing}</option>
            </NativeSelect>
            <NativeSelect
              name="loenart"
              defaultValue={filters.payCode ?? ""}
              aria-label={f.payCode}
            >
              <option value="">{f.allPayCodes}</option>
              {payCodes.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="fravaer"
              defaultValue={filters.absenceType ?? ""}
              aria-label={f.absence}
            >
              <option value="">{f.allAbsence}</option>
              {absenceCodes.map((code) => (
                <option key={code} value={code}>
                  {absences.labels[code] ?? code}
                </option>
              ))}
            </NativeSelect>
            {postingValues.length > 0 && (
              <NativeSelect
                name="kontering"
                defaultValue={filters.postingValue ?? ""}
                aria-label={f.posting}
              >
                <option value="">{f.allPosting}</option>
                {postingValues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
            )}
            <Input
              name="q"
              defaultValue={filters.query}
              placeholder={f.search}
              aria-label={f.search}
              className="w-48"
            />
          </div>
          {/* On phones the eight flags fold away; on larger screens they are always shown. */}
          <details
            className="group text-sm"
            open={!phone || filters.flags.length > 0}
            data-testid="flag-filters"
          >
            <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border bg-card px-3 font-medium md:hidden">
              <SlidersHorizontal className="size-4" />
              {f.moreFilters(filters.flags.length)}
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:mt-0">
              {FLAG_FILTERS.map((flag) => (
                <label
                  key={flag}
                  className="flex min-h-8 cursor-pointer items-center gap-1.5 pointer-coarse:min-h-11"
                  data-flag={flag}
                >
                  <Checkbox name="vis" value={flag} defaultChecked={filters.flags.includes(flag)} />
                  {f.flags[flag]}
                  <span className="text-muted-foreground tabular">({flagCounts[flag]})</span>
                </label>
              ))}
              <Button type="submit" variant="outline" size="sm">
                {t.show}
              </Button>
              {filtered && (
                <Link
                  href={`/tid/godkend?${new URLSearchParams({ uge: weekStart, ...(departmentId ? { afdeling: departmentId } : {}) })}`}
                  className="text-muted-foreground underline"
                >
                  {f.clear}
                </Link>
              )}
            </div>
          </details>
        </form>
        <div className="flex items-center gap-1">
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
      {filtered && (
        <p className="mb-3 text-sm text-muted-foreground" data-testid="filter-result">
          {f.showing(rows.length, accessible.length)}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState>{filtered ? f.noMatch : t.noEntries}</EmptyState>
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
          posting={posting}
          supplements={{ options: supplementOptions, chooseAll: true }}
          dates={dates}
        />
      )}
      {visibleExpenses.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{da.expenses.approveTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseApproval items={visibleExpenses} decidable={decidableExpenses} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
