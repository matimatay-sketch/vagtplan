import Link from "next/link";
import { ArrowRight, Coffee, MessageSquare, Users } from "lucide-react";
import { daypartOf, type Daypart } from "@/lib/domain/daypart";
import { localParts } from "@/lib/domain/schedule-time";
import { unpaidMinutes } from "@/lib/domain/breaks";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

const t = da.nextShift;

/**
 * "Næste vagt": the employee's next shift as the first thing on Oversigt. The
 * times are the memorable thing, in the colour of the part of the day.
 */
export function NextShiftCard({
  shift,
  today,
  colleagues,
  unread,
}: {
  shift: {
    start_at: string;
    end_at: string;
    label: string | null;
    department_name: string;
    breaks: unknown;
  };
  today: string;
  colleagues: string[];
  unread: number;
}) {
  const date = localParts(shift.start_at).date;
  const part: Daypart = daypartOf(shift.start_at);
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const when =
    date === today
      ? t.today
      : date === tomorrow.toISOString().slice(0, 10)
        ? t.tomorrow
        : formatDate(date);
  const pause = unpaidMinutes((shift.breaks ?? []) as { minutes: number; paid: boolean }[]);
  return (
    <section
      aria-labelledby="next-shift-h"
      data-daypart={part}
      data-testid="next-shift"
      className="mb-6 overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <div className="h-1.5 bg-(color:--dp)" aria-hidden />
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="next-shift-h" className="text-sm font-medium text-muted-foreground">
            {t.title}
          </h2>
          <span className="text-sm font-medium first-letter:uppercase">{when}</span>
        </div>
        <p
          className="flex items-center gap-3 font-display text-5xl font-semibold tracking-tight tabular sm:text-6xl"
          aria-label={t.times(localParts(shift.start_at).time, localParts(shift.end_at).time)}
        >
          <span>{localParts(shift.start_at).time}</span>
          <ArrowRight className="size-7 text-(color:--dp)" aria-hidden />
          <span>{localParts(shift.end_at).time}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(color:--dp-surface) px-3 py-1 font-medium">
            <span className="size-2 rounded-full bg-(color:--dp)" aria-hidden />
            {da.dayparts[part]}
            {shift.label ? ` · ${shift.label}` : ""}
          </span>
          <span className="rounded-full bg-muted px-3 py-1">{shift.department_name}</span>
          {pause > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
              <Coffee className="size-3.5" aria-hidden /> {t.pause(pause)}
            </span>
          ) : null}
        </div>
        <div className="grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
          <Link
            href="/min-vagtplan"
            className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
            data-testid="next-shift-colleagues"
          >
            <Users className="size-4 text-primary" aria-hidden />
            <span>
              <span className="font-medium">{t.withYou}</span>{" "}
              <span className="text-muted-foreground">
                {colleagues.length ? colleagues.join(", ") : t.alone}
              </span>
            </span>
          </Link>
          <Link href="/beskeder" className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
            <MessageSquare className="size-4 text-primary" aria-hidden />
            <span className="font-medium">{t.messages}</span>
            {unread > 0 ? (
              <span className="rounded-full bg-signal px-2 text-xs font-semibold text-signal-foreground tabular">
                {unread}
              </span>
            ) : (
              <span className="text-muted-foreground">{t.noMessages}</span>
            )}
          </Link>
        </div>
      </div>
    </section>
  );
}
