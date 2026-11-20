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
import { AvailabilityForm } from "./availability-form";

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
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                        s.is_mine ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <span className="grid">
                        <span className="font-semibold tabular">
                          {timeRange(s.start_at, s.end_at)}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            s.is_mine ? "opacity-80" : "text-muted-foreground",
                          )}
                        >
                          {s.is_mine ? s.department_name : s.employee_name || da.schedule.openShift}
                          {s.label ? ` · ${s.label}` : ""}
                        </span>
                      </span>
                      {s.kind === "on_call" ? (
                        <PhoneCall className="size-4" aria-label={da.schedule.kinds.on_call} />
                      ) : null}
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
