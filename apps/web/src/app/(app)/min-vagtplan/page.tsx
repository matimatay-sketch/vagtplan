import type { Metadata } from "next";
import { HelpTip } from "@/components/help/help";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PhoneCall, X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, isValidIsoDate, todayIn } from "@/lib/domain/civil-date";
import {
  durationMinutes,
  isoWeekNumber,
  localParts,
  timeRange,
  weekDates,
  weekStartOf,
  zonedTime,
} from "@/lib/domain/schedule-time";
import { formatHours } from "@/lib/domain/numbers";
import { unpaidMinutes, type DbBreak } from "@/lib/domain/breaks";
import { removeAvailabilityAction } from "@/lib/actions/availability";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";
import { daypartOf } from "@/lib/domain/daypart";
import { AvailabilityForm } from "./availability-form";
import {
  CancellationButton,
  SwapButton,
  type Colleague,
  type ColleagueShift,
} from "@/components/messages/shift-actions";

export const metadata: Metadata = { title: "Min vagtplan" };

const dayHeading = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export default async function MySchedulePage({ searchParams }: PageProps<"/min-vagtplan">) {
  const ctx = await requireContext();
  const t = da.mySchedule;
  if (!ctx.employee)
    return <PageHeader title={t.title} lead="Din bruger er ikke knyttet til en medarbejder." />;
  const sp = await searchParams;
  const today = todayIn(ctx.organization.timezone);
  const weekStart = weekStartOf(
    typeof sp.uge === "string" && isValidIsoDate(sp.uge) ? sp.uge : today,
  );
  const dates = weekDates(weekStart);
  const supabase = await createClient();
  const [{ data: shifts }, { data: availability }] = await Promise.all([
    supabase.rpc("published_shifts", {
      p_from: new Date(zonedTime(weekStart)).toISOString(),
      p_to: new Date(zonedTime(addDays(weekStart, 7))).toISOString(),
    }),
    supabase
      .from("availability")
      .select("id, date, kind, from_time, to_time, note")
      .eq("employee_id", ctx.employee.id)
      .is("archived_at", null)
      .gte("date", today)
      .order("date")
      .limit(60),
  ]);
  const list = shifts ?? [];
  const mine = list.filter((s) => s.is_mine);

  // Swap and afbud: own shifts that have not started yet.
  const now = new Date().toISOString();
  const upcoming = mine.filter((s) => s.start_at > now);
  const ids = upcoming.map((s) => s.id);
  const firstByDepartment = new Map<string, string>();
  for (const s of upcoming)
    if (!firstByDepartment.has(s.department_id)) firstByDepartment.set(s.department_id, s.id);
  const [{ data: openSwaps }, { data: openCancellations }, { data: ahead }, candidates] =
    await Promise.all([
      ids.length
        ? supabase
            .from("shift_swap")
            .select("shift_id, target_employee_id")
            .in("shift_id", ids)
            .in("status", ["proposed", "accepted"])
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase
            .from("shift_cancellation")
            .select("shift_id")
            .in("shift_id", ids)
            .eq("status", "open")
        : Promise.resolve({ data: [] }),
      // Colleagues' shifts the next four weeks, to swap with.
      ids.length
        ? supabase.rpc("published_shifts", {
            p_from: now,
            p_to: new Date(zonedTime(addDays(today, 29))).toISOString(),
          })
        : Promise.resolve({ data: [] }),
      Promise.all(
        [...firstByDepartment].map(async ([dept, shiftId]) => {
          const { data } = await supabase.rpc("swap_candidates", { p_shift_id: shiftId });
          return [dept, (data ?? []) as Colleague[]] as const;
        }),
      ),
    ]);
  const colleaguesIn = new Map(candidates);
  const colleagueShifts: ColleagueShift[] = (ahead ?? [])
    .filter((s) => !s.is_mine && s.employee_id)
    .map((s) => ({
      id: s.id,
      employee_id: s.employee_id!,
      start_at: s.start_at,
      end_at: s.end_at,
      department_id: s.department_id,
    }));
  const swapOf = new Map((openSwaps ?? []).map((w) => [w.shift_id, w.target_employee_id]));
  const cancelled = new Set((openCancellations ?? []).map((c) => c.shift_id));
  const colleagueName = (employeeId: string) =>
    [...colleaguesIn.values()].flat().find((c) => c.employee_id === employeeId)?.name ?? "";
  const total = mine
    .filter((s) => s.kind === "work")
    .reduce(
      (sum, s) =>
        sum +
        durationMinutes(s.start_at, s.end_at, unpaidMinutes(s.breaks as unknown as DbBreak[])),
      0,
    );

  return (
    <>
      <PageHeader
        title={t.title}
        help={t.lead}
        actions={
          <div className="flex items-center rounded-lg border bg-card p-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={da.schedule.previous}
            >
              <Link href={`/min-vagtplan?uge=${addDays(weekStart, -7)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="px-2 text-sm font-medium">
              {da.schedule.week(isoWeekNumber(weekStart))}
            </span>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={da.schedule.next}
            >
              <Link href={`/min-vagtplan?uge=${addDays(weekStart, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-label={t.mine} className="grid content-start gap-3" data-testid="my-week">
          <p className="text-sm text-muted-foreground">
            {t.mine}:{" "}
            <span className="font-medium text-foreground tabular">{formatHours(total)} t</span>
          </p>
          {list.length === 0 ? <EmptyState>{t.none}</EmptyState> : null}
          {dates.map((d) => {
            const day = list.filter((s) => localParts(s.start_at).date === d);
            if (!day.length) return null;
            return (
              <Card key={d} className={cn("gap-3 py-4", d === today && "border-signal")}>
                <CardHeader className="px-4">
                  <CardTitle className="text-sm capitalize">
                    {dayHeading.format(new Date(`${d}T00:00:00Z`))}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-4">
                  {day.map((s) => (
                    <div
                      key={s.id}
                      data-testid={s.is_mine ? "my-shift" : "colleague-shift"}
                      data-daypart={daypartOf(s.start_at)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2 text-sm",
                        s.is_mine
                          ? "border-l-(color:--dp) bg-(color:--dp-surface)"
                          : "border-l-(color:--dp)/40 bg-muted",
                      )}
                    >
                      <span className="grid">
                        <span className="font-semibold tabular">
                          {timeRange(s.start_at, s.end_at)}
                        </span>
                        <span className={cn("text-xs", "text-muted-foreground")}>
                          {s.is_mine ? s.department_name : s.employee_name || da.schedule.openShift}
                          {s.label ? ` · ${s.label}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center justify-end gap-2">
                        {s.kind === "on_call" ? (
                          <PhoneCall className="size-4" aria-label={da.schedule.kinds.on_call} />
                        ) : null}
                        {s.is_mine && s.start_at > now ? (
                          cancelled.has(s.id) ? (
                            <span
                              className="rounded bg-card px-2 py-0.5 text-xs font-medium text-destructive"
                              data-testid="cancellation-reported"
                            >
                              {da.cancellation.reported}
                            </span>
                          ) : swapOf.has(s.id) ? (
                            <span
                              className="rounded bg-card px-2 py-0.5 text-xs font-medium text-foreground"
                              data-testid="swap-pending"
                            >
                              {da.swap.pending(colleagueName(swapOf.get(s.id)!))}
                            </span>
                          ) : (
                            <>
                              <SwapButton
                                shift={s}
                                colleagues={colleaguesIn.get(s.department_id) ?? []}
                                colleagueShifts={colleagueShifts.filter(
                                  (c) => c.department_id === s.department_id,
                                )}
                              />
                              <CancellationButton shift={s} />
                            </>
                          )
                        ) : null}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </section>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>
              {t.availabilityTitle}
              <HelpTip>{t.availabilityLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <AvailabilityForm defaultDate={addDays(today, 1)} />
            <ul className="grid gap-1.5" data-testid="my-availability">
              {(availability ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noAvailability}</li>
              ) : null}
              {(availability ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{formatDate(a.date)}</span> ·{" "}
                    {da.schedule.availability[a.kind]}
                    {a.from_time
                      ? ` ${a.from_time.slice(0, 5)}–${a.to_time?.slice(0, 5)}`
                      : ` (${t.wholeDay.toLowerCase()})`}
                    {a.note ? (
                      <span className="block text-xs text-muted-foreground">{a.note}</span>
                    ) : null}
                  </span>
                  <form action={removeAvailabilityAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`${t.removeAvailability} ${a.date}`}
                    >
                      <X />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
