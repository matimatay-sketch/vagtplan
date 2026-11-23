import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageOn } from "@/lib/domain/age";
import { contractStatus } from "@/lib/domain/contracts";
import { todayIn } from "@/lib/domain/civil-date";
import { formatDate, formatWeeklyHours, fullName } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { CelebrationsToggle } from "@/components/dashboard/celebrations-toggle";
import { NotificationsCard } from "@/components/notifications/notifications-card";
import { CalendarFeedCard } from "@/components/notifications/calendar-feed-card";
import { hasAny } from "@/lib/permissions";

export const metadata: Metadata = { title: "Min profil" };

export default async function ProfilePage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.employees;
  const tc = da.contracts;
  const [{ data: devices }, { data: setting }, { data: feed }] = await Promise.all([
    supabase
      .from("push_device")
      .select("id, platform, label, created_at")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("notification_setting")
      .select("messages, schedule, absence, approvals")
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("calendar_feed")
      .select("created_at")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .maybeSingle(),
  ]);
  const notifications = (
    <NotificationsCard
      vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      devices={devices ?? []}
      settings={setting ?? { messages: true, schedule: true, absence: true, approvals: true }}
      showApprovals={hasAny(ctx.permissions, ["absence.approve"])}
    />
  );
  if (!ctx.employee) {
    return (
      <>
        <PageHeader
          title={da.nav.myProfile}
          lead="Din bruger er ikke knyttet til en medarbejder."
        />
        <div className="grid gap-6 md:grid-cols-2">{notifications}</div>
      </>
    );
  }
  const { data: me } = await supabase
    .from("employee")
    .select(
      "employee_number, first_name, last_name, email, phone, birth_date, school_obligated, show_celebrations, employee_department (is_primary, department!employee_department_organization_id_department_id_fkey (name)), contract (id, valid_from, valid_to, pay_form, weekly_norm_minutes, agreement:agreement_id (name))",
    )
    .eq("id", ctx.employee.id)
    .single();
  if (!me) return null;
  const age = ageOn(me.birth_date, today);
  const rows: [string, string][] = [
    [t.number, me.employee_number],
    [t.email, me.email ?? "–"],
    [t.phone, me.phone ?? "–"],
    [t.birthDate, `${formatDate(me.birth_date)} (${age} år)`],
    [t.departments, me.employee_department.map((d) => d.department?.name).join(", ")],
  ];
  return (
    <>
      <PageHeader title={fullName(me)} lead={ctx.profile.name} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stamdata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr]">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {age < 18 ? (
              <Badge variant="warning" className="mt-4">
                {t.youngWorker} – særlige regler for arbejdstid gælder
              </Badge>
            ) : null}
            <div className="mt-4">
              <CelebrationsToggle initial={me.show_celebrations} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.contracts}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {me.contract.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.agreement?.name}</span>
                  <Badge variant={contractStatus(c, today) === "active" ? "success" : "outline"}>
                    {tc[contractStatus(c, today)]}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground tabular">
                  {formatWeeklyHours(c.weekly_norm_minutes)} · {tc.payForms[c.pay_form]} ·{" "}
                  {formatDate(c.valid_from)} – {c.valid_to ? formatDate(c.valid_to) : tc.openEnded}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        {notifications}
        <CalendarFeedCard activeSince={feed?.created_at ?? null} />
      </div>
    </>
  );
}
