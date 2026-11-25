import type { Metadata } from "next";
import { SubmitButton } from "@/components/form";
import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, SlidersHorizontal, UserRoundCog } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApprovalTable, type DepartmentRights } from "@/components/time/approval-table";
import { RegisterForEmployee } from "@/components/time/register-for";
import { loadDeviationContext } from "@/lib/time/deviation-context";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment, hasAny } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { addDays, diffDays, todayIn } from "@/lib/domain/civil-date";
import { isoWeekNumber, weekStartOf } from "@/lib/domain/schedule-time";
import { formatDate } from "@/lib/format";
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
  parseDateRange,
  parseTimeFilters,
  shiftRange,
  type DateRange,
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
  const range = parseDateRange(sp, today);
  const dates = Array.from({ length: diffDays(range.to, range.from) + 1 }, (_, i) =>
    addDays(range.from, i),
  );
  // A whole Monday–Sunday week is shown as "Uge N", other ranges by their dates.
  const isWeek = range.from === weekStartOf(range.from) && dates.length === 7;
  const filters = parseTimeFilters(sp);

  const [overview, posting, supplementOptions] = await Promise.all([
    loadTimeOverview(supabase, ctx, { from: range.from, to: range.to, departmentId }),
    loadPostingDimensions(supabase),
    loadSupplementOptions(supabase, ctx.organization.id),
  ]);
  const deviation = await loadDeviationContext(
    supabase,
    ctx.organization.id,
    overview.rows.map((r) => r.employeeId),
  );
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
  const week = { start: range.from, end: range.to };
  // Agreements of the contracts in the period, for the agreement filter.
  // (All contracts the user may see, so the choices do not depend on the other filters.)
  const { data: contracts } = await supabase
    .from("contract")
    .select("employee_id, agreement:agreement_id (id, name)")
    .eq("organization_id", ctx.organization.id)
    .lte("valid_from", range.to)
    .or(`valid_to.is.null,valid_to.gte.${range.from}`);
  const agreementsByEmployee: Record<string, string[]> = {};
  const agreementNames = new Map<string, string>();
  for (const c of contracts ?? []) {
    if (!c.agreement) continue;
    (agreementsByEmployee[c.employee_id] ??= []).push(c.agreement.id);
    agreementNames.set(c.agreement.id, c.agreement.name);
  }
  const agreements = [...agreementNames.entries()].sort(([, a], [, b]) => a.localeCompare(b, "da"));
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
      (!filters.agreementId ||
        (agreementsByEmployee[i.employeeId] ?? []).includes(filters.agreementId)) &&
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
    agreementsByEmployee,
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
  const query = (f: TimeFilters, extra: Record<string, string>, r: DateRange = range) => {
    const q = new URLSearchParams({ fra: r.from, til: r.to });
    if (departmentId) q.set("afdeling", departmentId);
    if (f.status !== "all") q.set("status", f.status);
    for (const flag of f.flags) q.append("vis", flag);
    if (f.payCode) q.set("loenart", f.payCode);
    if (f.absenceType) q.set("fravaer", f.absenceType);
    if (f.postingValue) q.set("kontering", f.postingValue);
    if (f.agreementId) q.set("overenskomst", f.agreementId);
    if (f.query) q.set("q", f.query);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q;
  };
  const rangeHref = (r: DateRange) => `/tid/godkend?${query(filters, {}, r)}`;
  const filtered =
    filters.status !== "all" ||
    filters.flags.length > 0 ||
    Boolean(
      filters.payCode ||
      filters.absenceType ||
      filters.postingValue ||
      filters.agreementId ||
      filters.query,
    );
  const thisWeek = { from: weekStartOf(today), to: addDays(weekStartOf(today), 6) };
  const f = t.filters;
  // Substitutions where the user approves for someone else right now.
  const { data: substituting } = await supabase
    .from("approval_substitute")
    .select("absent_user_id, valid_to")
    .eq("organization_id", ctx.organization.id)
    .eq("substitute_user_id", ctx.userId)
    .is("archived_at", null)
    .lte("valid_from", today)
    .gte("valid_to", today);
  const { data: substituteNames } = substituting?.length
    ? await supabase.rpc("substitute_candidates", { p_org: ctx.organization.id })
    : { data: [] };
  const canSubstitute = hasAny(ctx.permissions, ["users.manage", "time.approve"]);
  // Employees the user may register time for (time.manage in their department).
  const manageDepartments = visible.filter((d) => rights[d.id]?.manage).map((d) => d.id);
  const { data: manageable } = manageDepartments.length
    ? await supabase
        .from("employee_department")
        .select(
          "employee_id, department_id, is_primary, employee:employee!employee_department_organization_id_employee_id_fkey (first_name, last_name, archived_at)",
        )
        .in("department_id", manageDepartments)
        .order("is_primary", { ascending: false })
    : { data: [] };
  const registerEmployees = [
    ...new Map(
      (manageable ?? [])
        .filter((m) => m.employee && !m.employee.archived_at)
        .map((m) => [
          m.employee_id,
          {
            id: m.employee_id,
            name: `${m.employee!.first_name} ${m.employee!.last_name}`,
            departmentId: m.department_id,
          },
        ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "da"));
  const missingCount = accessible.filter(
    (r) => r.kind === "missing" && rights[r.departmentId]?.manage,
  ).length;

  return (
    <>
      <PageHeader
        title={t.approveTitle}
        help={t.approveLead}
        actions={
          <>
            <RegisterForEmployee
              employees={registerEmployees}
              defaultDate={today < range.to ? today : range.to}
              posting={posting}
              supplements={{ options: supplementOptions, chooseAll: true }}
              deviation={deviation}
            />
            {hasAny(ctx.permissions, ["reminders.manage"]) ? (
              <Button asChild variant="outline">
                <Link href="/tid/godkend/paamindelser">
                  <BellRing /> {da.reminders.link}
                </Link>
              </Button>
            ) : null}
            {canSubstitute ? (
              <Button asChild variant="outline">
                <Link href="/tid/godkend/stedfortraedere">
                  <UserRoundCog /> {da.substitutes.link}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {substituting?.length ? (
        <p
          className="mb-4 rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground"
          data-testid="substitute-banner"
        >
          {da.substitutes.banner(
            substituting
              .map(
                (s) =>
                  (substituteNames ?? []).find((c) => c.user_id === s.absent_user_id)?.name ?? "–",
              )
              .join(", "),
            formatDate(
              substituting
                .map((s) => s.valid_to)
                .sort()
                .at(-1)!,
            ),
          )}
        </p>
      ) : null}
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <form className="flex w-full flex-col gap-3" data-testid="time-filters">
          <div className="flex flex-wrap items-end gap-2" data-testid="date-range">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {f.from}
              <Input type="date" name="fra" defaultValue={range.from} className="w-40" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {f.to}
              <Input type="date" name="til" defaultValue={range.to} className="w-40" />
            </label>
            <SubmitButton variant="outline">{f.showPeriod}</SubmitButton>
            {range.from !== thisWeek.from || range.to !== thisWeek.to ? (
              <Button asChild variant="ghost">
                <Link href={rangeHref(thisWeek)}>{f.thisWeek}</Link>
              </Button>
            ) : null}
          </div>
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
            {agreements.length > 0 && (
              <NativeSelect
                name="overenskomst"
                defaultValue={filters.agreementId ?? ""}
                aria-label={f.agreement}
              >
                <option value="">{f.allAgreements}</option>
                {agreements.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
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
              <SubmitButton variant="outline" size="sm">
                {t.show}
              </SubmitButton>
              {filtered && (
                <Link
                  href={`/tid/godkend?${new URLSearchParams({ fra: range.from, til: range.to, ...(departmentId ? { afdeling: departmentId } : {}) })}`}
                  className="text-muted-foreground underline"
                >
                  {f.clear}
                </Link>
              )}
            </div>
          </details>
        </form>
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={isWeek ? f.previousWeek : f.previousPeriod}
          >
            <Link href={rangeHref(shiftRange(range, -1))}>
              <ChevronLeft />
            </Link>
          </Button>
          <span
            className="min-w-20 text-center text-sm font-medium tabular"
            data-testid="week-label"
          >
            {isWeek
              ? `${t.week} ${isoWeekNumber(range.from)}`
              : `${formatDate(range.from)} – ${formatDate(range.to)}`}
          </span>
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={isWeek ? f.nextWeek : f.nextPeriod}
          >
            <Link href={rangeHref(shiftRange(range, 1))}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
      {missingCount > 0 && filters.status !== "missing" ? (
        <p
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm"
          data-testid="missing-summary"
        >
          {t.missingCount(missingCount)}
          <Link
            href={`/tid/godkend?${query({ ...filters, status: "missing" }, {})}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {t.showMissing}
          </Link>
        </p>
      ) : null}
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
          deviation={deviation}
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
