import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyDetails } from "@/components/lazy-details";
import { ReminderActions, ReminderForm } from "@/components/time/reminders";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasOrg } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { ReminderKind } from "@/lib/forms/reminders";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Påmindelser" };

/** Reminder rules: what to remind about, for whom, sent with a button or automatically. */
export default async function RemindersPage() {
  const ctx = await requireContext(["reminders.manage"]);
  const t = da.reminders;
  const supabase = await createClient();
  const orgWide = hasOrg(ctx.permissions, "reminders.manage");
  const [{ data: allDepartments }, { data: rules }, { data: links }] = await Promise.all([
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("reminder_rule")
      .select(
        "id, name, kind, department_ids, employee_ids, lookback_days, note, auto, weekdays, last_sent_at, last_sent_count",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("employee_department")
      .select(
        "employee_id, department_id, employee:employee!employee_department_organization_id_employee_id_fkey (first_name, last_name, archived_at)",
      )
      .eq("organization_id", ctx.organization.id),
  ]);
  // Department-scoped managers choose among their own departments.
  const departments = (allDepartments ?? []).filter(
    (d) => orgWide || ctx.responsibleDepartmentIds.includes(d.id),
  );
  const deptIds = new Set(departments.map((d) => d.id));
  const employeeMap = new Map<string, { id: string; name: string; departmentIds: string[] }>();
  for (const l of links ?? []) {
    if (!l.employee || l.employee.archived_at || !deptIds.has(l.department_id)) continue;
    const e = employeeMap.get(l.employee_id) ?? {
      id: l.employee_id,
      name: `${l.employee.first_name} ${l.employee.last_name}`,
      departmentIds: [],
    };
    e.departmentIds.push(l.department_id);
    employeeMap.set(l.employee_id, e);
  }
  const employees = [...employeeMap.values()].sort((a, b) => a.name.localeCompare(b.name, "da"));
  const deptName = new Map((allDepartments ?? []).map((d) => [d.id, d.name]));
  const empName = new Map(employees.map((e) => [e.id, e.name]));
  const audience = (r: { department_ids: string[]; employee_ids: string[] }) =>
    [
      r.department_ids.length
        ? r.department_ids.map((d) => deptName.get(d) ?? "–").join(", ")
        : t.allDepartments,
      r.employee_ids.length ? r.employee_ids.map((e) => empName.get(e) ?? "–").join(", ") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/tid/godkend"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {da.time.approveTitle}
          </Link>
        }
        title={t.title}
        help={t.lead}
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.newTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReminderForm
              departments={departments}
              employees={employees}
              requireDepartment={!orgWide}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {(rules ?? []).length === 0 ? (
              <EmptyState>{t.none}</EmptyState>
            ) : (
              <ul className="grid divide-y" data-testid="reminder-rules">
                {(rules ?? []).map((r) => (
                  <li key={r.id} className="grid gap-2 py-4" data-reminder={r.name}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <Badge variant="secondary">{t.shortKinds[r.kind as ReminderKind]}</Badge>
                      <Badge variant={r.auto ? "default" : "outline"}>
                        {r.auto
                          ? t.autoOn(r.weekdays.map((d) => t.weekdayNames[d - 1]).join(", "))
                          : t.manualOnly}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {audience(r)}
                      {" · "}
                      {r.last_sent_at
                        ? t.lastSent(formatDateTime(r.last_sent_at), r.last_sent_count ?? 0)
                        : t.neverSent}
                    </p>
                    <ReminderActions id={r.id} />
                    <LazyDetails className="text-sm" summary={t.editTitle}>
                      <div className="mt-3">
                        <ReminderForm
                          departments={departments}
                          employees={employees}
                          requireDepartment={!orgWide}
                          initial={{
                            id: r.id,
                            name: r.name,
                            kind: r.kind as ReminderKind,
                            department_ids: r.department_ids,
                            employee_ids: r.employee_ids,
                            lookback_days: r.lookback_days,
                            note: r.note,
                            auto: r.auto,
                            weekdays: r.weekdays,
                          }}
                        />
                      </div>
                    </LazyDetails>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
