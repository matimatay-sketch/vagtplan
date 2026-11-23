/**
 * Deviation reasons (afvigelsesårsager): when a registration needs a reason,
 * which reasons fit, and what a reason does to the pay. Pure.
 */
import { localParts } from "./schedule-time";

export const SITUATIONS = ["early_in", "late_in", "early_out", "late_out", "unplanned"] as const;
export type Situation = (typeof SITUATIONS)[number];

export type DeviationReason = {
  id: string;
  name: string;
  applies_to: Situation[];
  treatment: "none" | "payout" | "time_off" | "absence";
  time_off_mode: "agreement" | "factor";
  /** Time off per minute in bp (10000 = 1:1). */
  time_off_factor_bp: number;
  time_off_pay_code: string | null;
  absence_type: string | null;
};

type Span = { start: string; end: string };
const ms = (iso: string) => new Date(iso).getTime();
const minutesBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60_000);

/**
 * Where the registration deviates from the plan by more than the threshold:
 * at the start (early or late in) and at the end (early or late out). Without
 * a plan the registration is unplanned.
 */
export function situations(
  entry: { start: string; end: string | null },
  plan: Span | null,
  thresholdMinutes: number,
): {
  start: { kind: "early_in" | "late_in"; minutes: number } | null;
  end: { kind: "early_out" | "late_out"; minutes: number } | null;
  unplanned: boolean;
} {
  if (!plan) return { start: null, end: null, unplanned: true };
  const s = minutesBetween(entry.start, plan.start); // > 0: came early
  const e = entry.end ? minutesBetween(plan.end, entry.end) : 0; // > 0: left late
  return {
    start:
      Math.abs(s) > thresholdMinutes
        ? { kind: s > 0 ? "early_in" : "late_in", minutes: Math.abs(s) }
        : null,
    end:
      entry.end && Math.abs(e) > thresholdMinutes
        ? { kind: e > 0 ? "late_out" : "early_out", minutes: Math.abs(e) }
        : null,
    unplanned: false,
  };
}

/** The reasons set up for a situation, in their order. */
export function reasonsFor<R extends Pick<DeviationReason, "applies_to">>(
  situation: Situation,
  reasons: readonly R[],
): R[] {
  return reasons.filter((r) => r.applies_to.includes(situation));
}

export type PayAdjustments = {
  /** The parts of the registration that are paid (overtime from a part may be time off). */
  parts: { start: string; end: string; overtimeAsTimeOff: boolean }[];
  /** Time off by a reason's own factor (the minutes are not paid). */
  timeOff: { payCode: string; minutes: number; reason: string }[];
  /** Missing time recorded as absence (paid as the absence type says). */
  absence: { type: string; date: string; minutes: number }[];
};

const fits = (r: DeviationReason | null, s: Situation) =>
  r && r.applies_to.includes(s) ? r : null;

/**
 * What the chosen reasons do to the pay of a finished registration. Extra time
 * (early in, late out, or all of an unplanned registration) with a time-off
 * reason is either its own part whose overtime is time off (by the agreement)
 * or taken out of the pay and credited by the reason's factor. Missing time
 * (late in, early out) with an absence reason becomes absence of that type.
 * Unpaid breaks are subtracted from an unplanned registration credited by a factor.
 */
export function payAdjustments(
  entry: { start: string; end: string; unpaidBreakMinutes?: number },
  plan: Span | null,
  startReason: DeviationReason | null,
  endReason: DeviationReason | null,
): PayAdjustments {
  const out: PayAdjustments = { parts: [], timeOff: [], absence: [] };
  const credit = (r: DeviationReason, minutes: number) =>
    out.timeOff.push({
      payCode: r.time_off_pay_code!,
      minutes: Math.round((minutes * r.time_off_factor_bp) / 10000),
      reason: r.name,
    });

  if (!plan) {
    const r = fits(startReason, "unplanned");
    if (r?.treatment === "time_off" && r.time_off_mode === "factor") {
      credit(r, minutesBetween(entry.start, entry.end) - (entry.unpaidBreakMinutes ?? 0));
      return out;
    }
    out.parts.push({
      start: entry.start,
      end: entry.end,
      overtimeAsTimeOff: r?.treatment === "time_off",
    });
    return out;
  }

  let start = entry.start;
  let end = entry.end;
  const before: PayAdjustments["parts"] = [];
  const after: PayAdjustments["parts"] = [];

  // The start: came early (extra time) or late (missing time).
  if (ms(entry.start) < ms(plan.start)) {
    const r = fits(startReason, "early_in");
    if (r?.treatment === "time_off") {
      const extraEnd = ms(entry.end) < ms(plan.start) ? entry.end : plan.start;
      if (r.time_off_mode === "factor") credit(r, minutesBetween(entry.start, extraEnd));
      else before.push({ start: entry.start, end: extraEnd, overtimeAsTimeOff: true });
      start = extraEnd;
    }
  }

  // The end: left late (extra time) or early (missing time).
  if (ms(entry.end) > ms(plan.end)) {
    const r = fits(endReason, "late_out");
    if (r?.treatment === "time_off") {
      const extraStart = ms(entry.start) > ms(plan.end) ? entry.start : plan.end;
      if (r.time_off_mode === "factor") credit(r, minutesBetween(extraStart, entry.end));
      else after.push({ start: extraStart, end: entry.end, overtimeAsTimeOff: true });
      end = extraStart;
    }
  }

  out.parts = [
    ...before,
    ...(ms(end) > ms(start) ? [{ start, end, overtimeAsTimeOff: false }] : []),
    ...after,
  ];
  // Missing time (late in, early out) with an absence reason; one row per type and day.
  const absenceType = (r: DeviationReason | null, situation: Situation) => {
    const f = fits(r, situation);
    return f?.treatment === "absence" ? f.absence_type : null;
  };
  const lateType = absenceType(startReason, "late_in");
  const earlyType = absenceType(endReason, "early_out");
  const late = lateType ? Math.max(0, minutesBetween(plan.start, entry.start)) : 0;
  const early = earlyType ? Math.max(0, minutesBetween(entry.end, plan.end)) : 0;
  const date = localParts(plan.start).date;
  if (lateType && lateType === earlyType && late + early > 0)
    out.absence.push({ type: lateType, date, minutes: late + early });
  else {
    if (lateType && late > 0) out.absence.push({ type: lateType, date, minutes: late });
    if (earlyType && early > 0) out.absence.push({ type: earlyType, date, minutes: early });
  }
  return out;
}

/**
 * Whether a stamp needs a reason before it is saved: stamping in early, late
 * or without a shift (the shift the stamp function would pick: the closest
 * start within 4 hours), or stamping out early or late from a planned shift.
 */
export function stampQuestion<R extends Pick<DeviationReason, "applies_to">>(
  action: "in" | "out",
  now: string,
  plans: { candidates: readonly Span[]; openPlan: Span | null },
  reasons: readonly R[],
  thresholdMinutes: number,
): { situation: Situation; minutes: number; at: "start" | "end"; options: R[] } | null {
  let situation: Situation;
  let minutes = 0;
  if (action === "in") {
    const plan =
      [...plans.candidates]
        .filter((p) => Math.abs(ms(p.start) - ms(now)) <= 4 * 3600_000)
        .sort((a, b) => Math.abs(ms(a.start) - ms(now)) - Math.abs(ms(b.start) - ms(now)))[0] ??
      null;
    const s = situations({ start: now, end: null }, plan, thresholdMinutes);
    if (s.unplanned) situation = "unplanned";
    else if (s.start) [situation, minutes] = [s.start.kind, s.start.minutes];
    else return null;
  } else {
    if (!plans.openPlan) return null;
    const s = situations(
      { start: plans.openPlan.start, end: now },
      plans.openPlan,
      thresholdMinutes,
    );
    if (!s.end) return null;
    [situation, minutes] = [s.end.kind, s.end.minutes];
  }
  const options = reasons.filter((r) => r.applies_to.includes(situation));
  if (options.length === 0) return null;
  return {
    situation,
    minutes,
    at: action === "in" ? "start" : "end",
    options,
  };
}
