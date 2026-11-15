import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AbsenceRequestForm } from "@/components/absence/request-form";
import { AbsenceList } from "@/components/absence/absence-list";
import { PostingForm } from "@/components/absence/posting-form";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment, hasAny } from "@/lib/permissions";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { formatDays } from "@/lib/domain/leave";
import { loadLeave } from "@/lib/absence/load";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Godkend fravær" };

const PERMS = ["absence.view", "absence.manage", "absence.approve"] as const;

export default async function AbsenceAdminPage() {
  const ctx = await requireContext();
  const approverOf = new Set(ctx.timeApproverOf);
  if (!hasAny(ctx.permissions, PERMS) && approverOf.size === 0) redirect("/oversigt?adgang=nej");
  const t = da.absence;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);

  const { data: employees } = await supabase
    .from("employee")
    .select("id, first_name, last_name, employee_department (department_id)")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("first_name");
  const can = (
    key: (typeof PERMS)[number],
    e: { employee_department: { department_id: string }[] },
  ) =>
    ctx.permissions[key] === "organization" ||
    e.employee_department.some((d) =>
      canInDepartment(ctx.permissions, key, d.department_id, ctx.responsibleDepartmentIds),
    );
  const visible = (employees ?? []).filter(
    (e) => approverOf.has(e.id) || PERMS.some((k) => can(k, e)),
  );
  if (visible.length === 0)
    return (
      <>
        <PageHeader title={t.approveTitle} />
        <EmptyState>{da.common.notAllowed}</EmptyState>
      </>
    );
  const name = new Map(visible.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const ids = visible.map((e) => e.id);
  const { leave, absences } = await loadLeave(supabase, ctx, ids, {
    absencesFrom: addDays(today, -30),
  });
  const labelsFor = (id: string) =>
    Object.fromEntries((leave.get(id)?.types ?? []).map((x) => [x.code, x.label]));
  const listed = absences.map((a) => ({
    ...a,
    employeeName: name.get(a.employeeId),
    typeLabel: labelsFor(a.employeeId)[a.typeCode] ?? a.typeCode,
  }));
  const manageable = visible.filter((e) => can("absence.manage", e));
  const canDecide = (id: string) => {
    const e = visible.find((x) => x.id === id);
    return Boolean(e && (approverOf.has(id) || can("absence.approve", e)));
  };
  const pending = listed.filter((a) => a.status === "requested");
  const upcoming = listed.filter((a) => a.status === "approved" && a.to >= today);

  return (
    <>
      <PageHeader title={t.approveTitle} lead={t.approveLead} />
      <div className="grid gap-8">
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t.pending}</h2>
          {pending.length ? (
            <AbsenceList
              testId="pending-absences"
              rows={pending.filter((a) => canDecide(a.employeeId))}
              decide
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t.noPending}</p>
          )}
        </section>

        {manageable.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.register}</CardTitle>
              <CardDescription>{t.registerLead}</CardDescription>
            </CardHeader>
            <CardContent>
              <AbsenceRequestForm
                mode="register"
                employees={manageable.map((e) => ({ id: e.id, name: name.get(e.id)! }))}
                types={Object.fromEntries(
                  manageable.map((e) => [e.id, leave.get(e.id)?.types ?? []]),
                )}
                defaultDate={today}
              />
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t.absences}</h2>
          <AbsenceList
            testId="upcoming-absences"
            rows={upcoming}
            cancelApproved={manageable.length > 0}
          />
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t.balances}</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm" data-testid="team-balances">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">{t.employee}</th>
                  <th className="px-3 py-2 font-medium">{t.balance}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const l = leave.get(e.id);
                  const labels = labelsFor(e.id);
                  const totals = new Map<string, number>();
                  for (const b of l?.balances ?? [])
                    if (b.usableUntil >= today)
                      totals.set(b.account, (totals.get(b.account) ?? 0) + b.balance);
                  return (
                    <tr
                      key={e.id}
                      className="border-b last:border-0"
                      data-employee={name.get(e.id)}
                    >
                      <td className="px-3 py-2 font-medium">{name.get(e.id)}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-x-4 gap-y-1">
                          {[...totals].map(([acc, h]) => (
                            <span key={acc} className="tabular">
                              {labels[acc] ?? t.accounts[acc] ?? acc}:{" "}
                              <strong>{formatDays(h)}</strong>
                            </span>
                          ))}
                          {totals.size === 0 ? (
                            <span className="text-muted-foreground">–</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-warning-foreground">
                        {l?.mainHoliday && !l.mainHoliday.ok ? t.mainHolidayShort : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {manageable.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.addPosting}</CardTitle>
              <CardDescription>{t.postingLead}</CardDescription>
            </CardHeader>
            <CardContent>
              <PostingForm
                employees={manageable.map((e) => ({ id: e.id, name: name.get(e.id)! }))}
                balances={Object.fromEntries(
                  manageable.map((e) => [
                    e.id,
                    (leave.get(e.id)?.balances ?? [])
                      .filter((b) => b.usableUntil >= today)
                      .map((b) => ({
                        account: b.account,
                        label: labelsFor(e.id)[b.account] ?? t.accounts[b.account] ?? b.account,
                        periodStart: b.periodStart,
                        usableUntil: b.usableUntil,
                        balance: b.balance,
                      })),
                  ]),
                )}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
