import type { Metadata } from "next";
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
import { requireContext } from "@/lib/auth";
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
  const ctx = await requireContext(["admin", "manager"]);
  const { id } = await params;
  const { ny } = await searchParams;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.employees;
  const tc = da.contracts;

  const { data: employee } = await supabase
    .from("employee")
    .select(
      "id, employee_number, first_name, last_name, email, phone, birth_date, school_obligated, school_obligation_ends_on, hired_on, user_id, employee_department (department_id, is_primary), contract (id, valid_from, valid_to, pay_form, weekly_norm_minutes, staff_group, pay_step, exempt_from_registration, exemption_reason, agreement:agreement_id (name, is_example), local:local_agreement_id (name), pay_period_group (name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!employee) notFound();

  const [{ data: departments }, { data: agreements }, { data: payPeriodGroups }] =
    await Promise.all([
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
    ]);

  const age = ageOn(employee.birth_date, today);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const assignable = (departments ?? []).filter(
    (d) =>
      !employee.employee_department.some((l) => l.department_id === d.id) &&
      (ctx.role === "admin" || ctx.managedDepartmentIds.includes(d.id)),
  );
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
                    {status !== "ended" && !c.valid_to ? (
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stamdata</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeForm
                action={updateEmployeeAction}
                employee={employee}
                submitLabel={da.common.save}
              />
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
                  const canEdit =
                    ctx.role === "admin" || ctx.managedDepartmentIds.includes(l.department_id);
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
                  <Button type="submit" variant="outline">
                    {t.addDepartment}
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.login}</CardTitle>
              <CardDescription>{employee.user_id ? t.hasLogin : t.noLogin}</CardDescription>
            </CardHeader>
            {employee.user_id ? null : (
              <CardContent>
                <InviteForm employeeId={employee.id} canChooseRole={ctx.role === "admin"} />
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
