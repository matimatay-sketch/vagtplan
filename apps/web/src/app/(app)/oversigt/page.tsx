import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarHeart,
  Car,
  ClipboardCheck,
  Clock,
  Plane,
  Timer,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireContext } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { findActiveContract } from "@/lib/domain/contracts";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { localParts, zonedTime } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Oversigt" };

export default async function OverviewPage({ searchParams }: PageProps<"/oversigt">) {
  const ctx = await requireContext();
  const { adgang } = await searchParams;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.overview;

  const [{ data: employees }, { count: departmentCount }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, contract (valid_from, valid_to)")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null),
    supabase
      .from("department")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null),
  ]);
  // To act on: absence requests waiting for the user, and shifts left uncovered by absence.
  const soon = addDays(today, 14);
  const [{ data: requests }, { data: absent }] = await Promise.all([
    supabase.from("absence").select("id, employee_id").eq("status", "requested"),
    supabase
      .from("absence")
      .select("employee_id, from_date, to_date")
      .eq("status", "approved")
      .lte("from_date", soon)
      .gte("to_date", today),
  ]);
  const pendingRequests = (requests ?? []).filter((r) => r.employee_id !== ctx.employee?.id).length;
  const absentIds = [...new Set((absent ?? []).map((a) => a.employee_id))];
  const { data: shifts } = absentIds.length
    ? await supabase
        .from("shift")
        .select("employee_id, start_at")
        .in("employee_id", absentIds)
        .is("archived_at", null)
        .gte("start_at", new Date(zonedTime(today)).toISOString())
        .lt("start_at", new Date(zonedTime(addDays(soon, 1))).toISOString())
    : { data: [] };
  const uncovered = (shifts ?? []).filter((s) => {
    const d = localParts(s.start_at).date;
    return (absent ?? []).some(
      (a) => a.employee_id === s.employee_id && a.from_date <= d && d <= a.to_date,
    );
  }).length;
  const list = employees ?? [];
  const withActive = list.filter((e) => findActiveContract(e.contract, today)).length;
  const firstName = ctx.employee?.first_name ?? ctx.email.split("@")[0] ?? "";

  const stats = hasAny(ctx.permissions, ["employees.view", "employees.manage"])
    ? [
        { label: t.employees, value: list.length, href: "/medarbejdere" },
        { label: t.departments, value: departmentCount ?? 0, href: "/afdelinger" },
        {
          label: t.activeContracts,
          value: withActive,
          href: "/medarbejdere",
          note:
            list.length - withActive > 0
              ? `${list.length - withActive} ${t.missingContract}`
              : undefined,
        },
      ]
    : [];

  const can = (keys: Parameters<typeof hasAny>[1]) => hasAny(ctx.permissions, keys);
  const sc = t.shortcuts;
  const shortcuts = [
    {
      href: "/vagtplan",
      icon: CalendarClock,
      ...sc.schedule,
      show: can(["schedule.view", "schedule.manage"]),
    },
    { href: "/min-vagtplan", icon: CalendarHeart, ...sc.mySchedule, show: Boolean(ctx.employee) },
    { href: "/tid", icon: Timer, ...sc.time, show: Boolean(ctx.employee) },
    {
      href: "/tid/godkend",
      icon: ClipboardCheck,
      ...sc.approveTime,
      show: can(["time.view", "time.manage", "time.approve"]) || ctx.timeApproverOf.length > 0,
    },
    { href: "/fravaer", icon: Plane, ...sc.absence, show: Boolean(ctx.employee) },
    { href: "/koersel", icon: Car, ...sc.expenses, show: Boolean(ctx.employee) },
    { href: "/lon", icon: Wallet, ...sc.payroll, show: can(["payroll.view", "payroll.manage"]) },
  ].filter((x) => x.show);

  return (
    <>
      <PageHeader
        eyebrow={ctx.organization.name}
        title={t.greeting(firstName)}
        lead={ctx.profile.name}
      />
      {adgang === "nej" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{da.common.notAllowed}</AlertDescription>
        </Alert>
      ) : null}
      {stats.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <CardDescription>{s.label}</CardDescription>
                  <CardTitle className="font-display text-4xl tabular">{s.value}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className={s.note ? "text-warning-foreground" : undefined}>
                    {s.note ?? " "}
                  </span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
      {pendingRequests > 0 || uncovered > 0 ? (
        <Card className="mt-8" data-testid="to-act-on">
          <CardHeader>
            <CardTitle className="text-base">{t.toActOn}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {pendingRequests > 0 ? (
              <Link href="/fravaer/godkend" className="flex items-center gap-2 hover:underline">
                <Clock className="size-4" /> {t.pendingAbsence(pendingRequests)}
              </Link>
            ) : null}
            {uncovered > 0 ? (
              <Link
                href="/vagtplan"
                className="flex items-center gap-2 text-destructive hover:underline"
              >
                <CalendarClock className="size-4" /> {t.uncoveredSoon(uncovered)}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="shortcuts">
        {shortcuts.map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm transition-colors hover:bg-muted/60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <span className="grid gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground">{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
