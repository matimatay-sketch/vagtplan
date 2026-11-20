import type { Metadata } from "next";
import { SubmitButton } from "@/components/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldCheck, Star, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EndContractForm, NewContractForm } from "@/components/employees/contract-forms";
import { InviteForm } from "@/components/employees/invite-form";
import { ImpersonateButton } from "@/components/impersonation/impersonate-button";
import { MemberProfileForm } from "@/components/employees/profile-form";
import { ApproverForm } from "@/components/employees/approver-form";
import { PostingDefaultsForm } from "@/components/posting/posting-defaults";
import { loadPostingDimensions } from "@/lib/posting/load";
import type { PostingValues } from "@/lib/domain/posting";
import { addManagerAction, removeManagerAction } from "@/lib/actions/departments";
import { canIn, requireContext } from "@/lib/auth";
import { hasOrg, type PermissionKey } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  addEmployeeDepartmentAction,
  removeEmployeeDepartmentAction,
  updateEmployeeAction,
} from "@/lib/actions/employees";
import { ageOn } from "@/lib/domain/age";
import { contractStatus } from "@/lib/domain/contracts";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { formatDate, formatWeeklyHours, fullName } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Medarbejder" };

const statusVariant = { active: "success", ended: "outline", future: "secondary" } as const;

export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<"/medarbejdere/[id]">) {
  const ctx = await requireContext(["employees.view", "employees.manage"]);
  const { id } = await params;
  const { ny } = await searchParams;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.employees;
  const tc = da.contracts;

  const { data: employee } = await supabase
    .from("employee")
    .select(
      "id, employee_number, first_name, last_name, email, phone, birth_date, school_obligated, school_obligation_ends_on, hired_on, user_id, login_placeholder, approver_user_id, posting_defaults, employee_department (department_id, is_primary), contract (id, valid_from, valid_to, pay_form, weekly_norm_minutes, staff_group, pay_step, exempt_from_registration, exemption_reason, agreement:agreement_id (name, is_example), local:local_agreement_id (name), pay_period_group (name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!employee) notFound();

  const [
    { data: departments },
    { data: agreements },
    { data: payPeriodGroups },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase.from("agreement").select("id, name, kind, is_example").order("name"),
    supabase
      .from("pay_period_group")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("permission_profile")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);

  // Login: permission profile and departments the user is responsible for.
  const canManageUsers = hasOrg(ctx.permissions, "users.manage");
  const [{ data: membership }, { data: responsible }] = employee.user_id
    ? await Promise.all([
        supabase
          .from("membership")
          .select("profile_id")
          .eq("organization_id", ctx.organization.id)
          .eq("user_id", employee.user_id)
          .maybeSingle(),
        supabase
          .from("department_manager")
          .select("department_id")
          .eq("organization_id", ctx.organization.id)
          .eq("user_id", employee.user_id),
      ])
    : [{ data: null }, { data: [] as { department_id: string }[] }];
  const profileName = profiles?.find((p) => p.id === membership?.profile_id)?.name ?? null;
  // Possible personal time approvers: users of the organization, not the employee.
  const { data: members } = canManageUsers
    ? await supabase.rpc("organization_members", { org: ctx.organization.id })
    : { data: null };
  const approverOptions = (members ?? [])
    .filter((m) => m.user_id !== employee.user_id)
    .map((m) => ({
      userId: m.user_id,
      label: m.first_name ? `${m.first_name} ${m.last_name} (${m.email})` : m.email,
    }));
  const responsibleIds = (responsible ?? []).map((r) => r.department_id);

  const age = ageOn(employee.birth_date, today);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const assignable = (departments ?? []).filter(
    (d) =>
      !employee.employee_department.some((l) => l.department_id === d.id) &&
      canIn(ctx, "employees.manage", d.id),
  );
  const employeeDepts = employee.employee_department.map((l) => l.department_id);
  const canOnEmployee = (key: PermissionKey) =>
    hasOrg(ctx.permissions, key) || employeeDepts.some((d) => canIn(ctx, key, d));
  const canEdit = canOnEmployee("employees.manage");
  const canSeeContracts = canOnEmployee("contracts.view") || canOnEmployee("contracts.manage");
  const canManageContracts = canOnEmployee("contracts.manage");
  const canManagePosting = canEdit;
  const postingDimensions = canManagePosting ? await loadPostingDimensions(supabase) : [];
  const primaryDepartmentId =
    employee.employee_department.find((d) => d.is_primary)?.department_id ??
    employee.employee_department[0]?.department_id ??
    null;
  const canInvite = canOnEmployee("employees.invite");
  const contracts = [...employee.contract].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const latest = contracts[0];
  const defaultValidFrom = latest?.valid_to ? addDays(latest.valid_to, 1) : today;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/medarbejdere"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {fullName(employee)}
            <Badge variant="outline" className="tabular">
              {t.number} {employee.employee_number}
            </Badge>
            {age < 18 ? <Badge variant="warning">{t.youngWorker}</Badge> : null}
          </span>
        }
        lead={`${age} år · ${t.birthDate.toLowerCase()} ${formatDate(employee.birth_date)}`}
      />
      {ny ? (
        <Alert variant="signal" className="mb-6">
          <AlertDescription>Medarbejderen er oprettet. Tilføj nu en kontrakt.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-6">
          {canSeeContracts ? (
            <Card id="kontrakter">
              <CardHeader>
                <CardTitle>{t.contracts}</CardTitle>
                <CardDescription>
                  Et skift af overenskomst eller timetal midt i en periode er to kontrakter.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noContracts}</p>
                ) : null}
                {contracts.map((c) => {
                  const status = contractStatus(c, today);
                  return (
                    <div key={c.id} className="rounded-lg border p-4" data-testid="contract">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant[status]}>{tc[status]}</Badge>
                          <span className="font-medium">{c.agreement?.name}</span>
                          {c.agreement?.is_example ? (
                            <Badge variant="warning">{tc.exampleWarning}</Badge>
                          ) : null}
                          {c.local ? <Badge variant="secondary">+ {c.local.name}</Badge> : null}
                        </div>
                        <span className="text-sm text-muted-foreground tabular">
                          {formatDate(c.valid_from)} –{" "}
                          {c.valid_to ? formatDate(c.valid_to) : tc.openEnded}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-xs text-muted-foreground">{tc.weeklyHours}</dt>
                          <dd className="tabular">{formatWeeklyHours(c.weekly_norm_minutes)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{tc.payForm}</dt>
                          <dd>{tc.payForms[c.pay_form]}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{tc.payPeriodGroup}</dt>
                          <dd>{c.pay_period_group?.name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{tc.staffGroup}</dt>
                          <dd>{c.staff_group ?? "–"}</dd>
                        </div>
                      </dl>
                      {c.exempt_from_registration ? (
                        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                          {tc.exempt}: {c.exemption_reason}
                        </p>
                      ) : null}
                      {canManageContracts && status !== "ended" && !c.valid_to ? (
                        <div className="mt-4 border-t pt-4">
                          <EndContractForm
                            contractId={c.id}
                            employeeId={employee.id}
                            defaultDate={today}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {canManageContracts ? (
                  <details
                    className="group rounded-lg border border-dashed p-4"
                    open={contracts.length === 0}
                  >
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      {tc.new}
                    </summary>
                    <div className="mt-4">
                      <NewContractForm
                        employeeId={employee.id}
                        agreements={(agreements ?? []).filter((a) => a.kind !== "local")}
                        localAgreements={(agreements ?? []).filter((a) => a.kind === "local")}
                        payPeriodGroups={payPeriodGroups ?? []}
                        defaultValidFrom={defaultValidFrom}
                      />
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Stamdata</CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <EmployeeForm
                  action={updateEmployeeAction}
                  employee={employee}
                  submitLabel={da.common.saveDetails}
                />
              ) : (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    [t.email, employee.email ?? "–"],
                    [t.phone, employee.phone ?? "–"],
                    [t.hiredOn, formatDate(employee.hired_on)],
                    [t.schoolObligated, employee.school_obligated ? da.common.yes : da.common.no],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.departments}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ul className="grid gap-2">
                {employee.employee_department.map((l) => {
                  const canEdit = canIn(ctx, "employees.manage", l.department_id);
                  return (
                    <li
                      key={l.department_id}
                      className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        {deptName.get(l.department_id)}
                        {l.is_primary ? (
                          <Star
                            className="size-3.5 fill-signal text-signal"
                            aria-label={t.primary}
                          />
                        ) : null}
                      </span>
                      {canEdit && employee.employee_department.length > 1 ? (
                        <form action={removeEmployeeDepartmentAction}>
                          <input type="hidden" name="employee_id" value={employee.id} />
                          <input type="hidden" name="department_id" value={l.department_id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`${t.removeDepartment} ${deptName.get(l.department_id)}`}
                          >
                            <X />
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {assignable.length ? (
                <form action={addEmployeeDepartmentAction} className="flex gap-2">
                  <input type="hidden" name="employee_id" value={employee.id} />
                  <div className="flex-1">
                    <NativeSelect name="department_id" aria-label={t.addDepartment}>
                      {assignable.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <SubmitButton variant="outline">{t.addDepartment}</SubmitButton>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {canManagePosting && postingDimensions.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{da.posting.defaults}</CardTitle>
              </CardHeader>
              <CardContent>
                <PostingDefaultsForm
                  kind="employee"
                  id={employee.id}
                  departmentId={primaryDepartmentId}
                  dimensions={postingDimensions}
                  value={employee.posting_defaults as PostingValues}
                />
              </CardContent>
            </Card>
          ) : null}

          {canManageUsers ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.approver}</CardTitle>
                <CardDescription>{t.approverLead}</CardDescription>
              </CardHeader>
              <CardContent>
                <ApproverForm
                  employeeId={employee.id}
                  approverUserId={employee.approver_user_id}
                  members={approverOptions}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t.login}</CardTitle>
              <CardDescription>{employee.user_id ? t.hasLogin : t.noLogin}</CardDescription>
            </CardHeader>
            {employee.user_id ? (
              <CardContent className="grid gap-5">
                {canManageUsers && membership ? (
                  <div className="grid gap-1.5">
                    <div className="text-xs text-muted-foreground">{t.inviteProfile}</div>
                    <MemberProfileForm
                      userId={employee.user_id}
                      profileId={membership.profile_id}
                      profiles={profiles ?? []}
                      label={t.inviteProfile}
                    />
                  </div>
                ) : profileName ? (
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">{t.inviteProfile}</div>
                    {profileName}
                  </div>
                ) : null}
                <div className="grid gap-2" data-testid="responsible-departments">
                  <div className="text-xs text-muted-foreground">{da.users.departments}</div>
                  <div className="flex flex-wrap gap-2">
                    {responsibleIds.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {da.users.noDepartments}
                      </span>
                    ) : null}
                    {responsibleIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground"
                      >
                        {deptName.get(id)}
                        {canManageUsers ? (
                          <form action={removeManagerAction}>
                            <input type="hidden" name="department_id" value={id} />
                            <input type="hidden" name="user_id" value={employee.user_id!} />
                            <button
                              type="submit"
                              aria-label={`${da.departments.removeManager} ${deptName.get(id)}`}
                              className="grid size-5 place-items-center rounded-full hover:bg-black/10"
                            >
                              <X className="size-3" />
                            </button>
                          </form>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  {canManageUsers &&
                  (departments ?? []).some((d) => !responsibleIds.includes(d.id)) ? (
                    <form action={addManagerAction} className="flex gap-2">
                      <input type="hidden" name="user_id" value={employee.user_id} />
                      <div className="flex-1">
                        <NativeSelect name="department_id" aria-label={da.users.addResponsible}>
                          {(departments ?? [])
                            .filter((d) => !responsibleIds.includes(d.id))
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </NativeSelect>
                      </div>
                      <SubmitButton variant="outline">{da.common.makeResponsible}</SubmitButton>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            ) : null}
            {hasOrg(ctx.permissions, "users.impersonate") && employee.user_id !== ctx.userId ? (
              <CardContent>
                <ImpersonateButton
                  employeeId={employee.id}
                  name={`${employee.first_name} ${employee.last_name}`}
                />
              </CardContent>
            ) : null}
            {(employee.user_id && !employee.login_placeholder) || !canInvite ? null : (
              <CardContent>
                <InviteForm
                  employeeId={employee.id}
                  profiles={hasOrg(ctx.permissions, "users.manage") ? (profiles ?? []) : null}
                />
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
