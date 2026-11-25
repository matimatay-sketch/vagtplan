import type { Metadata } from "next";
import { loadDeviationContext, loadStampPlans } from "@/lib/time/deviation-context";
import { stampNeedsLocation } from "@/lib/time/location";
import { reasonsForEmployee } from "@/lib/time/deviation-types";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Cake,
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
import { canInDepartment, hasAny } from "@/lib/permissions";
import { BulletinBoard, type BoardPost } from "@/components/dashboard/bulletin-board";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { findActiveContract } from "@/lib/domain/contracts";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { localParts, timeRange, zonedTime } from "@/lib/domain/schedule-time";
import { daypartOf } from "@/lib/domain/daypart";
import { NextShiftCard } from "@/components/dashboard/next-shift";
import { OpenShiftList } from "@/components/shifts/open-shift-list";
import { loadOpenShiftsForMe } from "@/lib/schedule/open-shifts";
import { da } from "@/lib/i18n/da";
import { StampCard } from "@/components/time/stamp-card";
import { loadTimeOverview } from "@/lib/time/load";
import { stampPostingFor } from "@/lib/time/stamp-context";

export const metadata: Metadata = { title: "Oversigt" };

export default async function OverviewPage({ searchParams }: PageProps<"/oversigt">) {
  const ctx = await requireContext();
  const { adgang } = await searchParams;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.overview;
  const can = (keys: Parameters<typeof hasAny>[1]) => hasAny(ctx.permissions, keys);

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
  // Dashboard: own shifts, approvals waiting, bulletin board and celebrations.
  const nowIso = new Date().toISOString();
  // "I dag": the employee can stamp right from the overview (the most common task).
  const stamping = ctx.employee
    ? await (async () => {
        const id = ctx.employee!.id;
        const [overview, posting, deviation, plans, needsLocation] = await Promise.all([
          loadTimeOverview(supabase, ctx, { from: addDays(today, -1), to: today, onlyMine: true }),
          stampPostingFor(supabase, id),
          loadDeviationContext(supabase, ctx.organization.id, [id]),
          loadStampPlans(supabase, id),
          stampNeedsLocation(supabase, ctx.organization.id, id),
        ]);
        if (overview.exempt.has(id)) return null;
        const open = overview.rows.find((r) => r.kind === "entry" && r.status === "open");
        return {
          employeeId: id,
          openSince: open?.start ?? null,
          posting,
          deviation,
          plans,
          needsLocation,
          openPlan: open?.plan ? { start: open.plan.start, end: open.plan.end } : null,
        };
      })()
    : null;
  const in14 = new Date(zonedTime(addDays(today, 15))).toISOString();
  const approves = can(["time.approve"]) || ctx.timeApproverOf.length > 0;
  const head = { count: "exact" as const, head: true };
  const [
    { data: upcoming },
    { count: pendingTime },
    { count: pendingTrips },
    { count: pendingExpenses },
    { count: openOld },
    { count: drafts },
    { data: posts },
    { data: departments },
    { data: celebrations },
  ] = await Promise.all([
    // Employees cannot read the shift table; published_shifts is what they see.
    ctx.employee
      ? supabase.rpc("published_shifts", {
          p_from: new Date(zonedTime(addDays(today, -1))).toISOString(),
          p_to: in14,
        })
      : Promise.resolve({ data: [] }),
    approves
      ? supabase
          .from("time_entry")
          .select("id", head)
          .eq("status", "pending")
          .is("superseded_at", null)
          .is("archived_at", null)
          .neq("employee_id", ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000")
      : Promise.resolve({ count: 0 }),
    approves
      ? supabase
          .from("mileage_trip")
          .select("id", head)
          .eq("status", "pending")
          .is("archived_at", null)
          .neq("employee_id", ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000")
      : Promise.resolve({ count: 0 }),
    approves
      ? supabase
          .from("expense")
          .select("id", head)
          .eq("status", "pending")
          .is("archived_at", null)
          .neq("employee_id", ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000")
      : Promise.resolve({ count: 0 }),
    can(["time.manage", "time.approve"])
      ? supabase
          .from("time_entry")
          .select("id", head)
          .eq("status", "open")
          .is("superseded_at", null)
          .is("archived_at", null)
          .lt("start_at", new Date(zonedTime(today)).toISOString())
      : Promise.resolve({ count: 0 }),
    can(["schedule.publish"])
      ? supabase
          .from("shift")
          .select("id", head)
          .eq("status", "draft")
          .is("archived_at", null)
          .gte("start_at", nowIso)
      : Promise.resolve({ count: 0 }),
    supabase
      .from("bulletin_post")
      .select("id, title, body, pinned, department_id, created_at, expires_on")
      .is("archived_at", null)
      .or(`expires_on.is.null,expires_on.gte.${today}`)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase.rpc("celebrations", { p_org: ctx.organization.id, p_from: today, p_days: 14 }),
  ]);
  type Snap = {
    employee_id: string | null;
    start_at: string;
    end_at: string;
    label?: string | null;
  };
  // "Næste vagt": the next (or current) own shift, and who else works then.
  const nextShift =
    (upcoming ?? [])
      .filter((p) => p.is_mine && Date.parse(p.end_at) > Date.parse(nowIso))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))[0] ?? null;
  const colleaguesOnNext = nextShift
    ? [
        ...new Set(
          (upcoming ?? [])
            .filter(
              (p) =>
                !p.is_mine &&
                p.employee_id &&
                p.start_at < nextShift.end_at &&
                p.end_at > nextShift.start_at,
            )
            .map((p) => p.employee_name.split(" ")[0]!),
        ),
      ]
    : [];
  const [{ data: unread }, openShifts] = ctx.employee
    ? await Promise.all([
        supabase.rpc("unread_message_count", { p_org: ctx.organization.id }),
        loadOpenShiftsForMe(supabase, ctx.organization.id, 14),
      ])
    : [{ data: 0 }, []];
  const myShifts: Snap[] = (upcoming ?? [])
    .filter((p) => p.is_mine && Date.parse(p.end_at) > Date.parse(nowIso))
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((p) => ({
      employee_id: p.employee_id,
      start_at: p.start_at,
      end_at: p.end_at,
      label: p.label,
    }))
    .slice(0, 5);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const canPostIn = (dept: string | null) =>
    dept === null
      ? ctx.permissions["bulletin.manage"] === "organization"
      : canInDepartment(ctx.permissions, "bulletin.manage", dept, ctx.responsibleDepartmentIds);
  const boardPosts: BoardPost[] = (posts ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    pinned: p.pinned,
    departmentId: p.department_id,
    expiresOn: p.expires_on,
    departmentName: p.department_id ? (deptName.get(p.department_id) ?? null) : null,
    createdAt: formatDate(localParts(p.created_at).date),
    author: null,
    canDelete: canPostIn(p.department_id),
  }));
  const postTo = [
    ...(canPostIn(null) ? [{ id: null, name: da.dashboard.everyone }] : []),
    ...(departments ?? []).filter((d) => canPostIn(d.id)).map((d) => ({ id: d.id, name: d.name })),
  ];
  const waiting = [
    { n: pendingTime ?? 0, text: da.dashboard.pendingTime, href: "/tid/godkend?status=pending" },
    {
      n: (pendingTrips ?? 0) + (pendingExpenses ?? 0),
      text: da.dashboard.pendingExpenses,
      href: "/tid/godkend",
    },
    { n: openOld ?? 0, text: da.dashboard.openStamps, href: "/tid/godkend?status=open" },
    { n: drafts ?? 0, text: da.dashboard.drafts, href: "/vagtplan" },
  ].filter((w) => w.n > 0);
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
      {nextShift ? (
        <NextShiftCard
          shift={nextShift}
          today={today}
          colleagues={colleaguesOnNext}
          unread={unread ?? 0}
        />
      ) : null}
      {openShifts.length ? (
        <section
          className="mb-6 grid gap-3"
          aria-labelledby="open-shifts-h"
          data-testid="dashboard-open-shifts"
        >
          <h2
            id="open-shifts-h"
            className="flex items-center justify-between text-base font-semibold"
          >
            {da.openShifts.title}
            <Link
              href="/min-vagtplan"
              className="text-sm font-normal text-primary underline-offset-4 hover:underline"
            >
              {da.dashboard.seeSchedule}
            </Link>
          </h2>
          <OpenShiftList rows={openShifts.slice(0, 3)} />
        </section>
      ) : null}
      {stamping ? (
        <section className="mb-6" aria-label={da.dashboard.todayTitle} data-testid="today">
          <StampCard
            organizationId={ctx.organization.id}
            employeeId={stamping.employeeId}
            openSince={stamping.openSince}
            posting={stamping.posting}
            reasons={reasonsForEmployee(stamping.deviation, stamping.employeeId)}
            thresholdMinutes={stamping.deviation.thresholdMinutes}
            stampPlans={stamping.plans}
            openPlan={stamping.openPlan}
            requireLocation={stamping.needsLocation}
          />
        </section>
      ) : null}
      {adgang === "nej" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{da.common.notAllowed}</AlertDescription>
        </Alert>
      ) : null}
      {stats.length ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader className="max-sm:p-3">
                  <CardDescription className="max-sm:text-xs">{s.label}</CardDescription>
                  <CardTitle className="font-display text-2xl tabular sm:text-4xl">
                    {s.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground max-sm:hidden">
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
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          {ctx.employee ? (
            <Card data-testid="my-shifts">
              <CardHeader>
                <CardTitle className="text-base">{da.dashboard.myShifts}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {myShifts.length === 0 ? (
                  <p className="text-muted-foreground">
                    {da.dashboard.noShifts}{" "}
                    <Link
                      href="/min-vagtplan"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {da.dashboard.seeSchedule}
                    </Link>
                  </p>
                ) : (
                  myShifts.map((p) => (
                    <Link
                      key={p.start_at}
                      href="/min-vagtplan"
                      data-daypart={daypartOf(p.start_at)}
                      className="flex items-center justify-between gap-2 rounded-lg border-l-4 border-l-(color:--dp) bg-(color:--dp-surface) px-3 py-2 hover:brightness-[0.97]"
                    >
                      <span className="capitalize tabular">
                        {localParts(p.start_at).date === today
                          ? da.dashboard.today
                          : formatDate(localParts(p.start_at).date)}
                      </span>
                      <span className="font-medium tabular">
                        {timeRange(p.start_at, p.end_at)}
                        {p.label ? ` · ${p.label}` : ""}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
          {pendingRequests > 0 || uncovered > 0 || waiting.length > 0 ? (
            <Card data-testid="to-act-on">
              <CardHeader>
                <CardTitle className="text-base">{t.toActOn}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {waiting.map((w) => (
                  <Link
                    key={w.href + w.n}
                    href={w.href}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <ClipboardCheck className="size-4" /> {w.text(w.n)}
                  </Link>
                ))}
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
          <Card data-testid="celebrations">
            <CardHeader>
              <CardTitle className="text-base">{da.dashboard.celebrations}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {(celebrations ?? []).length === 0 ? (
                <p className="text-muted-foreground">{da.dashboard.noCelebrations}</p>
              ) : (
                (celebrations ?? []).map((c) => (
                  <div
                    key={`${c.employee_id}-${c.kind}`}
                    className="flex items-center justify-between gap-2"
                    data-kind={c.kind}
                  >
                    <span className="flex items-center gap-2">
                      {c.kind === "birthday" ? (
                        <Cake className="size-4 text-signal" />
                      ) : (
                        <Award className="size-4 text-signal" />
                      )}
                      <span>
                        <span className="font-medium">{c.name}</span>
                        {c.department_name ? (
                          <span className="text-muted-foreground"> · {c.department_name}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="text-right text-muted-foreground">
                      {c.kind === "birthday"
                        ? da.dashboard.birthday
                        : da.dashboard.anniversary(c.years ?? 0)}{" "}
                      · {c.on_date === today ? da.dashboard.today : formatDate(c.on_date)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle className="text-base">{da.dashboard.bulletin}</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletinBoard posts={boardPosts} postTo={postTo} />
          </CardContent>
        </Card>
      </div>
      {/* On phones the bottom bar already holds these shortcuts. */}
      <div
        className="mt-8 hidden gap-3 sm:grid-cols-2 md:grid lg:grid-cols-3"
        data-testid="shortcuts"
      >
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
