import { Temporal } from "temporal-polyfill";
import type { ResolutionWarning, ResolvedRule } from "../agreement/resolve";
import type { Primitive, Severity } from "../agreement/schema";
import { EngineContext } from "../context";
import type { AbsenceInput, EngineInput, WorkIntervalInput } from "../model";
import {
  addDays,
  diffDays,
  parseInstant,
  isoWeekStart,
  localDate,
  MINUTE,
  startOfLocalDay,
  wallTime,
  type IsoDate,
} from "../time/local-time";
import {
  breakMinutes,
  cutSpan,
  freeGaps,
  mergeSpans,
  minutesOf,
  normalizeIntervals,
  overlap,
  workPieces,
  workingTimePieces,
  type Span,
  type WorkInterval,
} from "../timeline";
import { formatMinutes } from "../format";

export type Violation = {
  ruleId: string;
  primitive: Primitive;
  severity: Severity;
  code: string;
  /** Danish, for display. */
  message: string;
  date: IsoDate;
  intervalIds: string[];
  details: Record<string, number | string | boolean | null>;
  source: string;
  todoJura: string | null;
};

export type ValidateInput = EngineInput & {
  /** Planned and/or actual intervals. Include history before `from` for rolling rules. */
  intervals: WorkIntervalInput[];
  absences?: AbsenceInput[];
  /** Local dates to report violations for (inclusive). */
  from: IsoDate;
  to: IsoDate;
};

export type ValidationResult = {
  violations: Violation[];
  resolutionWarnings: ResolutionWarning[];
};

const H24 = 24 * 60 * MINUTE;

function violation(
  rule: ResolvedRule,
  defaultSeverity: Severity,
  v: Omit<Violation, "ruleId" | "primitive" | "severity" | "source" | "todoJura"> & {
    severity?: Severity | undefined;
  },
): Violation {
  const { severity, ...rest } = v;
  return {
    ruleId: rule.id,
    primitive: rule.primitive,
    severity: severity ?? rule.severity ?? defaultSeverity,
    source: rule.source,
    todoJura: rule.todo_jura,
    ...rest,
  };
}

/** Work minutes per local date (pieces split at local midnight). */
export function minutesByDate(
  intervals: readonly WorkInterval[],
  ctx: EngineContext,
): Map<IsoDate, number> {
  const out = new Map<IsoDate, number>();
  for (const i of intervals) {
    if (i.kind === "on_call") continue;
    const breakRule = ctx.rule(localDate(i.start, ctx.tz), "break");
    const pieces = workingTimePieces(
      i,
      breakRule?.params.paid ?? false,
      breakRule?.params.paid_counts_as_working_time ?? true,
    );
    for (const piece of pieces) {
      const first = localDate(piece.start, ctx.tz);
      const cuts: number[] = [];
      for (let d = addDays(first, 1); startOfLocalDay(d, ctx.tz) < piece.end; d = addDays(d, 1)) {
        cuts.push(startOfLocalDay(d, ctx.tz));
      }
      for (const part of cutSpan(piece, cuts)) {
        const date = localDate(part.start, ctx.tz);
        out.set(date, (out.get(date) ?? 0) + minutesOf(part));
      }
    }
  }
  return out;
}

/** Time that counts as rest for the rest rules: on-call without a call-out, unless configured otherwise. */
function restsDuring(i: WorkInterval, ctx: EngineContext): boolean {
  if (i.kind !== "on_call") return false;
  return ctx.rule(localDate(i.start, ctx.tz), "on_call")?.params.counts_as_rest ?? true;
}

function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function youngGroup(ctx: EngineContext, date: IsoDate) {
  const rule = ctx.rule(date, "young_worker");
  if (!rule) return null;
  const age = ctx.age(date);
  if (age >= 18) return null;
  const school = ctx.schoolObligated(date);
  const group = rule.params.groups.find(
    (g) =>
      (g.applies.min_age === null || age >= g.applies.min_age) &&
      (g.applies.max_age === null || age < g.applies.max_age) &&
      (g.applies.school_obligated === null || g.applies.school_obligated === school),
  );
  return group ? { rule, group } : null;
}

// ---------------------------------------------------------------------------
// Rest (hviletid) – rolling 24-hour windows anchored at block starts and ends.
// ---------------------------------------------------------------------------
function checkDailyRest(
  ctx: EngineContext,
  work: WorkInterval[],
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const blocks = mergeSpans(work.filter((i) => !restsDuring(i, ctx)));
  const reported = new Map<number, Violation>();
  const windows: Span[] = blocks.flatMap((b) => [
    { start: b.start, end: b.start + H24 },
    { start: b.end - H24, end: b.end },
  ]);
  for (const w of windows) {
    const inside = blocks.filter((b) => b.start < w.end && b.end > w.start);
    const target = inside.at(-1)!;
    const idx = blocks.indexOf(target);
    const date = localDate(target.start, ctx.tz);
    if (date < from || date > to || reported.has(idx)) continue;
    const rule = ctx.rule(date, "rest");
    const young = youngGroup(ctx, date);
    const required = Math.max(rule?.params.daily_minutes ?? 0, young?.group.min_rest_minutes ?? 0);
    if (!rule && !young) continue;
    const longest = Math.max(0, ...freeGaps(blocks, w).map(minutesOf));
    if (longest >= required) continue;
    const source =
      young && (young.group.min_rest_minutes ?? 0) >= (rule?.params.daily_minutes ?? 0)
        ? young.rule
        : rule!;
    reported.set(
      idx,
      violation(source, "BLOCKING", {
        severity: source.primitive === "young_worker" ? "BLOCKING" : undefined,
        code: "REST_DAILY",
        date,
        intervalIds: inside.flatMap((b) => b.members.map((m) => m.id)),
        message: `Kun ${formatMinutes(longest)} sammenhængende hvile inden for 24 timer (krav: ${formatMinutes(required)}).`,
        details: { requiredMinutes: required, longestRestMinutes: longest },
      }),
    );
  }
  return [...reported.values()];
}

// ---------------------------------------------------------------------------
// Weekly rest (fridøgn): a gap of weekly + daily rest that overlaps the
// period by at least the weekly rest.
// ---------------------------------------------------------------------------
function checkWeeklyRest(
  ctx: EngineContext,
  work: WorkInterval[],
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const blocks = mergeSpans(work.filter((i) => !restsDuring(i, ctx)));
  if (blocks.length === 0) return [];
  const everything: Span = {
    start: blocks[0]!.start - 30 * H24,
    end: blocks.at(-1)!.end + 30 * H24,
  };
  const gaps = freeGaps(blocks, everything);
  const out: Violation[] = [];

  const qualifies = (period: Span, weeklyMin: number, dailyMin: number) =>
    gaps.some(
      (g) => minutesOf(g) >= weeklyMin + dailyMin && overlap(g, period) >= weeklyMin * MINUTE,
    );

  const checkedWeeks = new Set<IsoDate>();
  for (const b of blocks) {
    const date = localDate(b.start, ctx.tz);
    if (date < from || date > to) continue;
    const rule = ctx.rule(date, "rest");
    if (!rule) continue;
    const { weekly_minutes: weekly, daily_minutes: daily, weekly_period } = rule.params;
    if (weekly_period === "calendar_week") {
      const ws = isoWeekStart(date);
      if (checkedWeeks.has(ws)) continue;
      checkedWeeks.add(ws);
      const period = {
        start: startOfLocalDay(ws, ctx.tz),
        end: startOfLocalDay(addDays(ws, 7), ctx.tz),
      };
      if (!qualifies(period, weekly, daily)) {
        out.push(
          violation(rule, "BLOCKING", {
            code: "REST_WEEKLY",
            date: ws,
            intervalIds: blocks
              .filter((x) => overlap(x, period) > 0)
              .flatMap((x) => x.members.map((m) => m.id)),
            message: `Ugen mangler et fridøgn: ${formatMinutes(weekly)} i forlængelse af den daglige hvile.`,
            details: { requiredMinutes: weekly + daily },
          }),
        );
      }
    } else {
      const period = { start: b.start, end: b.start + 7 * H24 };
      if (!qualifies(period, weekly, daily) && !out.some((v) => v.date === date)) {
        out.push(
          violation(rule, "BLOCKING", {
            code: "REST_WEEKLY",
            date,
            intervalIds: b.members.map((m) => m.id),
            message: `Ingen fridøgn inden for 7 døgn fra denne vagt.`,
            details: { requiredMinutes: weekly + daily },
          }),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 48-hour average over the reference period. Absence days are neutral.
// ---------------------------------------------------------------------------
function referencePeriod(
  date: IsoDate,
  months: number,
  anchor: string,
): { start: IsoDate; end: IsoDate } {
  const year = Number(date.slice(0, 4));
  let start = Temporal.PlainDate.from(`${year - 1}-${anchor}`);
  const target = Temporal.PlainDate.from(date);
  while (Temporal.PlainDate.compare(start.add({ months }), target) <= 0)
    start = start.add({ months });
  return { start: start.toString(), end: start.add({ months }).subtract({ days: 1 }).toString() };
}

function checkWeeklyAverage(
  ctx: EngineContext,
  byDate: Map<IsoDate, number>,
  absences: readonly AbsenceInput[],
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const out: Violation[] = [];
  const seen = new Set<string>();
  const absenceDays = new Set(absences.flatMap((a) => datesBetween(a.from, a.to)));
  for (const date of datesBetween(from, to)) {
    const rule = ctx.rule(date, "max_weekly_average");
    if (!rule) continue;
    const p = rule.params;
    const period = referencePeriod(date, p.reference_months, p.reference_anchor);
    if (seen.has(period.start)) continue;
    seen.add(period.start);
    const days = datesBetween(period.start, period.end).filter((d) => !absenceDays.has(d));
    if (days.length === 0) continue;
    const total = days.reduce((s, d) => s + (byDate.get(d) ?? 0), 0);
    const average = Math.round(total / (days.length / 7));
    const level: Severity | null =
      average > p.max_average_minutes
        ? (rule.severity ?? "BLOCKING")
        : average > p.warning_average_minutes
          ? "WARNING"
          : null;
    if (!level) continue;
    out.push(
      violation(rule, "BLOCKING", {
        severity: level,
        code: "MAX_WEEKLY_AVERAGE",
        date: period.start,
        intervalIds: [],
        message: `Gennemsnitlig ugentlig arbejdstid ${formatMinutes(average)} i referenceperioden ${period.start} – ${period.end} (grænse ${formatMinutes(p.max_average_minutes)}, advarsel over ${formatMinutes(p.warning_average_minutes)}).`,
        details: {
          averageMinutes: average,
          maxAverageMinutes: p.max_average_minutes,
          warningAverageMinutes: p.warning_average_minutes,
          periodStart: period.start,
          periodEnd: period.end,
          neutralDays: datesBetween(period.start, period.end).length - days.length,
        },
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily checks: break, young worker limits, minimum shift length, night work.
// ---------------------------------------------------------------------------
function dayIntervals(ctx: EngineContext, work: WorkInterval[]): Map<IsoDate, WorkInterval[]> {
  const out = new Map<IsoDate, WorkInterval[]>();
  for (const i of work) {
    if (i.kind === "on_call") continue;
    const d = localDate(i.start, ctx.tz);
    out.set(d, [...(out.get(d) ?? []), i]);
  }
  return out;
}

/** Breaks on a day: registered breaks plus gaps between that day's intervals. */
function breakOnDay(intervals: WorkInterval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = sorted.reduce((s, i) => s + breakMinutes(i), 0);
  for (let k = 1; k < sorted.length; k++)
    total += Math.max(0, minutesOf({ start: sorted[k - 1]!.end, end: sorted[k]!.start }));
  return total;
}

function checkDaily(
  ctx: EngineContext,
  work: WorkInterval[],
  byDate: Map<IsoDate, number>,
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const out: Violation[] = [];
  const perDay = dayIntervals(ctx, work);

  for (const date of datesBetween(from, to)) {
    const minutes = byDate.get(date) ?? 0;
    const startedToday = perDay.get(date) ?? [];
    const ids = startedToday.map((i) => i.id);
    const young = youngGroup(ctx, date);

    // Break (pause). The work counted is what started this day.
    const workStarted = startedToday.reduce(
      (s, i) => s + workPieces(i).reduce((a, p) => a + minutesOf(p), 0),
      0,
    );
    const taken = breakOnDay(startedToday);
    if (
      young &&
      young.group.break_after_minutes !== null &&
      workStarted > young.group.break_after_minutes
    ) {
      const required = young.group.break_min_minutes ?? 1;
      if (taken < required) {
        out.push(
          violation(young.rule, "BLOCKING", {
            code: "YOUNG_BREAK",
            date,
            intervalIds: ids,
            message: `${young.group.label}: pause på mindst ${formatMinutes(required)} når arbejdsdagen er over ${formatMinutes(young.group.break_after_minutes)} (registreret: ${formatMinutes(taken)}).`,
            details: {
              workMinutes: workStarted,
              breakMinutes: taken,
              requiredBreakMinutes: required,
            },
          }),
        );
      }
    } else {
      const rule = ctx.rule(date, "break");
      if (rule && workStarted > rule.params.after_minutes) {
        const required = rule.params.min_minutes ?? 1;
        if (taken < required) {
          out.push(
            violation(rule, "WARNING", {
              code: "BREAK_MISSING",
              date,
              intervalIds: ids,
              message:
                rule.params.min_minutes === null
                  ? `Arbejdsdagen er over ${formatMinutes(rule.params.after_minutes)} uden registreret pause.`
                  : `Pause på mindst ${formatMinutes(required)} mangler (registreret: ${formatMinutes(taken)}).`,
              details: {
                workMinutes: workStarted,
                breakMinutes: taken,
                requiredBreakMinutes: required,
              },
            }),
          );
        }
      }
    }

    // Young workers: daily maximum.
    if (young) {
      const schoolDay = ctx.isSchoolDay(date);
      const limit =
        schoolDay && young.group.max_daily_minutes_school_day !== null
          ? young.group.max_daily_minutes_school_day
          : young.group.max_daily_minutes;
      if (limit !== null && minutes > limit) {
        out.push(
          violation(young.rule, "BLOCKING", {
            code: "YOUNG_MAX_DAILY",
            date,
            intervalIds: work.filter((i) => byDateTouches(i, date, ctx)).map((i) => i.id),
            message: `${young.group.label}: ${formatMinutes(minutes)} arbejde denne dag (højst ${formatMinutes(limit)}${schoolDay && young.group.max_daily_minutes_school_day !== null ? " på skoledage" : ""}).`,
            details: {
              minutes,
              limitMinutes: limit,
              schoolDay,
              schoolDaysAssumed: !ctx.input.schoolDays,
            },
          }),
        );
      }
    }

    // Minimum shift length.
    const minShift = ctx.rule(date, "min_shift");
    if (minShift) {
      for (const i of startedToday) {
        if (i.kind !== "work") continue;
        const length = minutesOf(i);
        if (length < minShift.params.min_minutes) {
          out.push(
            violation(minShift, "WARNING", {
              code: "MIN_SHIFT",
              date,
              intervalIds: [i.id],
              message: `Vagten er ${formatMinutes(length)} – kortere end minimum ${formatMinutes(minShift.params.min_minutes)}.`,
              details: { minutes: length, minMinutes: minShift.params.min_minutes },
            }),
          );
        }
      }
    }
  }

  // Young workers: weekly maximum (minutes on young days only).
  const weeks = new Set(datesBetween(from, to).map(isoWeekStart));
  for (const ws of weeks) {
    const days = datesBetween(ws, addDays(ws, 6));
    const youngDays = days.map((d) => ({ d, y: youngGroup(ctx, d) })).filter((x) => x.y);
    const first = youngDays.find((x) => x.y!.group.max_weekly_minutes !== null);
    if (!first) continue;
    const limit = first.y!.group.max_weekly_minutes!;
    const total = youngDays.reduce((s, x) => s + (byDate.get(x.d) ?? 0), 0);
    if (total > limit) {
      out.push(
        violation(first.y!.rule, "BLOCKING", {
          code: "YOUNG_MAX_WEEKLY",
          date: ws,
          intervalIds: [],
          message: `${first.y!.group.label}: ${formatMinutes(total)} arbejde i ugen (højst ${formatMinutes(limit)}).`,
          details: { minutes: total, limitMinutes: limit },
        }),
      );
    }
  }
  return out;
}

function byDateTouches(i: WorkInterval, date: IsoDate, ctx: EngineContext): boolean {
  return (
    overlap(i, {
      start: startOfLocalDay(date, ctx.tz),
      end: startOfLocalDay(addDays(date, 1), ctx.tz),
    }) > 0
  );
}

function nightMinutes(
  i: WorkInterval,
  fromHhmm: string,
  toHhmm: string,
  ctx: EngineContext,
): number {
  const first = localDate(i.start, ctx.tz);
  let total = 0;
  for (const d of [addDays(first, -1), first, addDays(first, 1)]) {
    const start = wallTime(d, fromHhmm, ctx.tz);
    let end = wallTime(d, toHhmm, ctx.tz);
    if (end <= start) end = wallTime(addDays(d, 1), toHhmm, ctx.tz);
    for (const p of workPieces(i)) total += overlap(p, { start, end });
  }
  return Math.round(total / MINUTE);
}

function checkNight(
  ctx: EngineContext,
  work: WorkInterval[],
  byDate: Map<IsoDate, number>,
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const out: Violation[] = [];
  const reportedWeeks = new Set<IsoDate>();
  const perDay = dayIntervals(ctx, work);
  for (const date of datesBetween(from, to)) {
    const rule = ctx.rule(date, "night_work");
    if (!rule) continue;
    const p = rule.params;
    const windowDays = datesBetween(addDays(date, 1 - p.reference_days), date);
    const nightShift = windowDays.some((d) =>
      (perDay.get(d) ?? []).some(
        (i) => nightMinutes(i, p.from, p.to, ctx) >= p.night_shift_min_minutes,
      ),
    );
    if (!nightShift) continue;
    const average = Math.round(
      windowDays.reduce((s, d) => s + (byDate.get(d) ?? 0), 0) / p.reference_days,
    );
    const ws = isoWeekStart(date);
    if (average > p.max_average_daily_minutes && !reportedWeeks.has(ws)) {
      reportedWeeks.add(ws);
      out.push(
        violation(rule, "WARNING", {
          code: "NIGHT_AVERAGE",
          date,
          intervalIds: (perDay.get(date) ?? []).map((i) => i.id),
          message: `Natarbejder: ${formatMinutes(average)} i gennemsnit pr. døgn over ${p.reference_days} døgn (højst ${formatMinutes(p.max_average_daily_minutes)}).`,
          details: {
            averageMinutes: average,
            limitMinutes: p.max_average_daily_minutes,
            referenceDays: p.reference_days,
          },
        }),
      );
    }
  }
  return out;
}

/**
 * Validates planned or actual working time against all rules that apply to
 * the employee. Pure: no I/O. History before `from` should be included in
 * `intervals` so rolling rules (rest, averages) see it.
 */
export function validateSchedule(input: ValidateInput): ValidationResult {
  if (input.to < input.from) throw new Error("to before from");
  if (diffDays(input.to, input.from) > 400) throw new Error("validation range too long");
  const ctx = new EngineContext(input);
  const work = normalizeIntervals(input.intervals);
  const byDate = minutesByDate(work, ctx);
  const violations = [
    ...checkDailyRest(ctx, work, input.from, input.to),
    ...checkWeeklyRest(ctx, work, input.from, input.to),
    ...checkWeeklyAverage(ctx, byDate, input.absences ?? [], input.from, input.to),
    ...checkDaily(ctx, work, byDate, input.from, input.to),
    ...checkNight(ctx, work, byDate, input.from, input.to),
    ...checkWeekendOff(ctx, work, input.from, input.to),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  return { violations, resolutionWarnings: ctx.resolutionWarnings };
}

// ---------------------------------------------------------------------------
// Weekendfri: at least N free weekends in each window of M weeks.
// ---------------------------------------------------------------------------
function checkWeekendOff(
  ctx: EngineContext,
  work: WorkInterval[],
  from: IsoDate,
  to: IsoDate,
): Violation[] {
  const out: Violation[] = [];
  const working = work.filter((i) => i.kind !== "on_call");
  const weeks = [...new Set(datesBetween(from, to).map(isoWeekStart))];
  for (const ws of weeks) {
    const rule = ctx.rule(ws, "weekend_off") ?? ctx.rule(addDays(ws, 6), "weekend_off");
    if (!rule) continue;
    const { weekends_off, per_weeks } = rule.params;
    let free = 0;
    const worked: IsoDate[] = [];
    for (let k = per_weeks - 1; k >= 0; k--) {
      const sat = addDays(ws, 5 - 7 * k);
      const weekend = {
        start: startOfLocalDay(sat, ctx.tz),
        end: startOfLocalDay(addDays(sat, 2), ctx.tz),
      };
      if (working.some((i) => overlap(i, weekend) > 0)) worked.push(sat);
      else free++;
    }
    if (free < weekends_off) {
      out.push(
        violation(rule, "WARNING", {
          code: "WEEKEND_OFF",
          date: ws,
          intervalIds: [],
          message: `Kun ${free} fri weekend${free === 1 ? "" : "er"} i de seneste ${per_weeks} uger (krav: ${weekends_off}).`,
          details: {
            freeWeekends: free,
            requiredWeekends: weekends_off,
            perWeeks: per_weeks,
            workedWeekends: worked.join(","),
          },
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Varsling: is a new/changed/removed shift published early enough?
// ---------------------------------------------------------------------------
export type NoticeItem = {
  intervalId: string;
  start: string;
  change: "new" | "changed" | "removed";
};

export type NoticeInput = EngineInput & {
  /** The moment of publishing (ISO instant). */
  now: string;
  items: NoticeItem[];
};

export function validateNotice(input: NoticeInput): ValidationResult {
  const ctx = new EngineContext(input);
  const now = parseInstant(input.now);
  const violations: Violation[] = [];
  for (const item of input.items) {
    const start = parseInstant(item.start);
    const date = localDate(start, ctx.tz);
    const rule = ctx.rule(date, "notice");
    if (!rule) continue;
    const p = rule.params;
    const hours =
      item.change === "new"
        ? (p.publish_notice_hours ??
          (p.publish_notice_days === null ? null : p.publish_notice_days * 24))
        : p.change_notice_hours;
    if (hours === null) continue;
    const ahead = (start - now) / (60 * MINUTE);
    if (ahead >= hours) continue;
    violations.push(
      violation(rule, "WARNING", {
        code: "NOTICE_LATE",
        date,
        intervalIds: [item.intervalId],
        message:
          item.change === "new"
            ? `Vagten offentliggøres med ${formatMinutes(Math.max(0, Math.round(ahead * 60)))} varsel (krav: ${hours} timer).`
            : `Ændringen varsles med ${formatMinutes(Math.max(0, Math.round(ahead * 60)))} (krav: ${hours} timer).`,
        details: {
          requiredHours: hours,
          hoursAhead: Math.round(ahead * 10) / 10,
          change: item.change,
        },
      }),
    );
  }
  return { violations, resolutionWarnings: ctx.resolutionWarnings };
}
