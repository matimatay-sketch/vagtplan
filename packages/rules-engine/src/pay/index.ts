import { Temporal } from "temporal-polyfill";
import type { LayerRef, ResolvedRule } from "../agreement/resolve";
import type { Amount, Primitive, Rule } from "../agreement/schema";
import { EngineContext } from "../context";
import type {
  AbsenceInput,
  ContractFacts,
  EngineInput,
  ShiftSupplementInput,
  WorkIntervalInput,
} from "../model";
import {
  addDays,
  formatInstant,
  isoWeekStart,
  isoWeekday,
  localDate,
  MINUTE,
  parseHhmm,
  startOfLocalDay,
  toLocal,
  wallTime,
  type Instant,
  type IsoDate,
} from "../time/local-time";
import {
  cutSpan,
  minutesOf,
  normalizeIntervals,
  overlap,
  payPieces,
  type Span,
  type WorkInterval,
} from "../timeline";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type CalcPayInput = EngineInput & {
  /** Pay period (local dates, inclusive). Lines are produced only for this range. */
  period: { from: IsoDate; to: IsoDate };
  /**
   * Approved actual time. Include whole norm periods (e.g. full weeks) around
   * the pay period so overtime is found correctly at the edges.
   */
  worked: WorkIntervalInput[];
  /** Planned shifts, used for rounding, minimum-shift guarantees and "outside planned" overtime. */
  planned?: WorkIntervalInput[];
  absences?: AbsenceInput[];
};

export type ExplainedInterval = {
  intervalId: string;
  date: IsoDate;
  start: string;
  end: string;
  minutes: number;
};

export type PayLine = {
  payCode: string;
  label: string;
  /** hours: money for minutes worked; time_off_minutes: credited time off; fixed: amount per shift (quantity 0). */
  unit: "hours" | "time_off_minutes" | "fixed";
  quantityMinutes: number;
  rateOre: number;
  amountOre: number;
  explanation: {
    ruleId: string;
    /** "shift_supplement" for supplements put on a shift by the organization. */
    primitive: Primitive | "shift_supplement";
    source: string;
    layer: LayerRef;
    todoJura: string | null;
    note: string | null;
    intervals: ExplainedInterval[];
  };
};

export type PayNote = { code: string; message: string; date?: IsoDate };

export type PayResult = {
  lines: PayLine[];
  /** Total daily working time (lovkrav: samlet daglig arbejdstid), paid work only. */
  dailyMinutes: Record<IsoDate, number>;
  notes: PayNote[];
  resolutionWarnings: EngineContext["resolutionWarnings"];
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
type Segment = Span & {
  intervalId: string;
  kind: "work" | "call_out";
  date: IsoDate;
  holiday: boolean;
  overtime: { rule: ResolvedRule & Rule<"overtime">; tier: number } | null;
};

type Candidate = {
  rule: ResolvedRule;
  payCode: string;
  rateOre: number;
  unit: PayLine["unit"];
  /** Minutes credited per minute worked (time off), in bp. */
  factorBp: number;
  note: string | null;
};

function roundTo(ms: Instant, unit: number, mode: "nearest" | "up" | "down"): Instant {
  const u = unit * MINUTE;
  const f = mode === "up" ? Math.ceil : mode === "down" ? Math.floor : Math.round;
  return f(ms / u) * u;
}

/** Afrunding: snap to the planned shift within tolerance, otherwise round. */
function applyRounding(
  ctx: EngineContext,
  i: WorkInterval,
  planned: Map<string, WorkInterval>,
): WorkInterval {
  const rule = ctx.rule(localDate(i.start, ctx.tz), "rounding");
  if (!rule || i.kind === "on_call") return i;
  const p = rule.params;
  const plan = i.plannedShiftId ? planned.get(i.plannedShiftId) : undefined;
  let start = roundTo(i.start, p.unit_minutes, p.start);
  let end = roundTo(i.end, p.unit_minutes, p.end);
  if (plan && i.start <= plan.start && plan.start - i.start <= p.snap_before_start_minutes * MINUTE)
    start = plan.start;
  if (plan && i.end >= plan.end && i.end - plan.end <= p.snap_after_end_minutes * MINUTE)
    end = plan.end;
  if (end <= start) return { ...i, start, end: start, breaks: [] };
  return { ...i, start, end, breaks: i.breaks.filter((b) => b.end > start && b.start < end) };
}

function dayCuts(span: Span, ctx: EngineContext): Instant[] {
  const cuts: Instant[] = [];
  const first = localDate(span.start, ctx.tz);
  for (let d = first; startOfLocalDay(d, ctx.tz) < span.end; d = addDays(d, 1))
    cuts.push(startOfLocalDay(d, ctx.tz));
  return cuts;
}

/** Window instances [start,end) anchored on local date d. */
function windowInstance(d: IsoDate, from: string, to: string, tz: string): Span {
  const start = wallTime(d, from, tz);
  const end =
    parseHhmm(to) <= parseHhmm(from) ? wallTime(addDays(d, 1), to, tz) : wallTime(d, to, tz);
  return { start, end };
}

function boundaryCuts(span: Span, ctx: EngineContext, plannedSpans: Span[]): Instant[] {
  const cuts = new Set<Instant>(dayCuts(span, ctx));
  const first = localDate(span.start, ctx.tz);
  for (const d of [addDays(first, -1), first, addDays(first, 1), addDays(first, 2)]) {
    for (const rule of ctx.rules(d, "time_window_supplement")) {
      for (const w of rule.params.windows) {
        const inst = windowInstance(d, w.from, w.to, ctx.tz);
        cuts.add(inst.start);
        cuts.add(inst.end);
      }
    }
    const h = ctx.holiday(d);
    if (h?.from) cuts.add(wallTime(d, h.from, ctx.tz));
  }
  for (const p of plannedSpans) {
    cuts.add(p.start);
    cuts.add(p.end);
  }
  return [...cuts];
}

function isHolidayTime(ctx: EngineContext, date: IsoDate, at: Instant): boolean {
  const h = ctx.holiday(date);
  if (!h) return false;
  return h.from === null || toLocal(at, ctx.tz).minuteOfDay >= parseHhmm(h.from);
}

const WEEKDAY_KEYS = ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function windowMatches(
  rule: ResolvedRule & Rule<"time_window_supplement">,
  seg: Segment,
  ctx: EngineContext,
): boolean {
  const first = localDate(seg.start, ctx.tz);
  for (const d of [addDays(first, -1), first]) {
    for (const w of rule.params.windows) {
      const inst = windowInstance(d, w.from, w.to, ctx.tz);
      if (!(inst.start <= seg.start && seg.end <= inst.end)) continue;
      const dow = WEEKDAY_KEYS[isoWeekday(d)]!;
      const holidayExcluded = rule.params.exclude_holidays && seg.holiday;
      const ok = w.days.some((sel) => {
        if (sel === "holiday") return seg.holiday;
        if (sel === "any") return !holidayExcluded;
        if (sel === "weekday") return isoWeekday(d) <= 5 && !holidayExcluded;
        return sel === dow && !holidayExcluded;
      });
      if (ok) return true;
    }
  }
  return false;
}

function baseRate(
  ctx: EngineContext,
  date: IsoDate,
  contract: ContractFacts,
): { rule: ResolvedRule & Rule<"pay_rate">; ore: number } | null {
  const rule = ctx.rule(date, "pay_rate");
  if (!rule) return null;
  const age = ctx.age(date);
  let best: { score: number; ore: number } | null = null;
  for (const r of rule.params.rates) {
    if (r.staff_group !== null && r.staff_group !== contract.staffGroup) continue;
    if (r.pay_step !== null && r.pay_step !== contract.payStep) continue;
    if (r.min_age !== null && age < r.min_age) continue;
    if (r.max_age !== null && age >= r.max_age) continue;
    if (r.valid_from !== null && date < r.valid_from) continue;
    if (r.valid_to !== null && date > r.valid_to) continue;
    const score = [r.staff_group, r.pay_step, r.min_age, r.max_age, r.valid_from].filter(
      (x) => x !== null,
    ).length;
    if (!best || score > best.score) best = { score, ore: r.hourly_ore };
  }
  return best ? { rule, ore: best.ore } : null;
}

function amountRate(amount: Amount, base: number): number {
  return amount.type === "ore_per_hour" ? amount.ore : Math.round((base * amount.bp) / 10000);
}

function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Key of the overtime counting unit a date belongs to. */
function unitKey(rule: ResolvedRule & Rule<"overtime">, ctx: EngineContext, date: IsoDate): string {
  switch (rule.params.trigger) {
    case "daily_norm":
    case "outside_planned":
      return date;
    case "weekly_norm":
      return isoWeekStart(date);
    case "period_norm": {
      const norm = ctx.rule(date, "norm");
      if (!norm || norm.params.period.type === "week") return isoWeekStart(date);
      const { weeks, anchor } = norm.params.period;
      const days = Temporal.PlainDate.from(anchor).until(Temporal.PlainDate.from(date), {
        largestUnit: "days",
      }).days;
      const idx = Math.floor(days / (weeks * 7));
      return addDays(anchor, idx * weeks * 7);
    }
  }
}

function unitDates(
  rule: ResolvedRule & Rule<"overtime">,
  ctx: EngineContext,
  key: string,
): IsoDate[] {
  switch (rule.params.trigger) {
    case "daily_norm":
    case "outside_planned":
      return [key];
    case "weekly_norm":
      return datesBetween(key, addDays(key, 6));
    case "period_norm": {
      const norm = ctx.rule(key, "norm");
      const weeks = norm && norm.params.period.type === "weeks" ? norm.params.period.weeks : 1;
      return datesBetween(key, addDays(key, weeks * 7 - 1));
    }
  }
}

function absenceMinutesOn(ctx: EngineContext, a: AbsenceInput, date: IsoDate): number {
  if (a.minutesPerDay != null) return a.minutesPerDay;
  const contract = ctx.contractOn(date);
  if (!contract || isoWeekday(date) > 5) return 0;
  return Math.round(contract.weeklyNormMinutes / 5);
}

/** Norm minutes for a unit: weekly norm per day (/7) summed, or the daily norm. */
function unitNorm(
  rule: ResolvedRule & Rule<"overtime">,
  ctx: EngineContext,
  dates: IsoDate[],
  absences: readonly AbsenceInput[],
): number | null {
  let norm = 0;
  for (const d of dates) {
    const contract = ctx.contractOn(d);
    if (!contract) continue;
    if (rule.params.trigger === "daily_norm") {
      const daily = ctx.rule(d, "norm")?.params.daily_minutes ?? null;
      if (daily === null) return null;
      norm += daily;
    } else norm += contract.weeklyNormMinutes / 7;
  }
  // Absence that counts towards the norm is treated as if worked first.
  for (const a of absences) {
    for (const d of dates) {
      if (d < a.from || d > a.to) continue;
      const type = ctx.rule(d, "absence")?.params.types.find((t) => t.code === a.type);
      if (type?.counts_towards_norm) norm -= absenceMinutesOn(ctx, a, d);
    }
  }
  return Math.max(0, Math.round(norm));
}

/** Splits segments where cumulative minutes cross `at` (minutes into the unit). */
function splitAtMinute(seg: Segment, cumulativeBefore: number, at: number): Segment[] {
  const offset = at - cumulativeBefore;
  if (offset <= 0 || offset >= minutesOf(seg)) return [seg];
  const cut = seg.start + offset * MINUTE;
  return [
    { ...seg, end: cut },
    { ...seg, start: cut },
  ];
}

function markOvertime(
  segments: Segment[],
  ctx: EngineContext,
  absences: readonly AbsenceInput[],
  plannedSpans: Span[],
): Segment[] {
  // Collect overtime rules (by id) that apply on any date, by priority.
  const rules = new Map<string, ResolvedRule & Rule<"overtime">>();
  for (const s of segments)
    for (const r of ctx.rules(s.date, "overtime")) if (!rules.has(r.id)) rules.set(r.id, r);
  const ordered = [...rules.values()].sort((a, b) => b.priority - a.priority);

  let current = [...segments].sort((a, b) => a.start - b.start);
  for (const rule of ordered) {
    const next: Segment[] = [];
    const used = new Map<string, number>(); // unit → regular minutes counted
    const otUsed = new Map<string, number>(); // unit → overtime minutes counted
    const norms = new Map<string, number | null>();
    for (const seg of current) {
      const applies =
        seg.overtime === null && ctx.rules(seg.date, "overtime").some((r) => r.id === rule.id);
      if (!applies) {
        next.push(seg);
        continue;
      }
      const key = unitKey(rule, ctx, seg.date);
      let pieces: Segment[];
      if (rule.params.trigger === "outside_planned") {
        const inside = plannedSpans.some((p) => p.start <= seg.start && seg.end <= p.end);
        pieces = [inside ? seg : { ...seg, overtime: { rule, tier: 0 } }];
      } else {
        if (!norms.has(key))
          norms.set(key, unitNorm(rule, ctx, unitDates(rule, ctx, key), absences));
        const norm = norms.get(key)!;
        if (norm === null) {
          next.push(seg);
          continue;
        }
        const before = used.get(key) ?? 0;
        pieces = splitAtMinute(seg, before, norm).map((p, idx, arr) => {
          const isOt = arr.length === 2 ? idx === 1 : before >= norm;
          return isOt ? { ...p, overtime: { rule, tier: 0 } } : p;
        });
        used.set(key, before + minutesOf(seg));
      }
      // Split overtime pieces at tier boundaries.
      for (const p of pieces) {
        if (!p.overtime) {
          next.push(p);
          continue;
        }
        let rest: Segment | null = p;
        while (rest) {
          const done = otUsed.get(key) ?? 0;
          let tier = 0;
          let acc = 0;
          for (; tier < rule.params.tiers.length - 1; tier++) {
            acc += rule.params.tiers[tier]!.up_to_minutes!;
            if (done < acc) break;
          }
          const tierEnd = tier < rule.params.tiers.length - 1 ? acc : Infinity;
          const parts = splitAtMinute(rest, done, tierEnd);
          const head: Segment = { ...parts[0]!, overtime: { rule, tier } };
          next.push(head);
          otUsed.set(key, done + minutesOf(head));
          rest = parts.length === 2 ? parts[1]! : null;
        }
      }
    }
    current = next;
  }
  return current;
}

function candidatesFor(
  seg: Segment,
  ctx: EngineContext,
  contract: ContractFacts,
  base: number,
): Candidate[] {
  const out: Candidate[] = [];
  if (seg.overtime) {
    const { rule, tier } = seg.overtime;
    const t = rule.params.tiers[tier]!;
    const supplement = amountRate(t.amount, base);
    const includeBase = contract.payForm === "monthly" && rule.params.monthly_paid_includes_base;
    out.push(
      rule.params.compensation === "time_off"
        ? {
            rule,
            payCode: t.pay_code,
            rateOre: 0,
            unit: "time_off_minutes",
            factorBp: rule.params.time_off_factor_bp,
            note: null,
          }
        : {
            rule,
            payCode: t.pay_code,
            rateOre: supplement + (includeBase ? base : 0),
            unit: "hours",
            factorBp: 10000,
            note: null,
          },
    );
  }
  for (const rule of ctx.rules(seg.date, "time_window_supplement")) {
    if (seg.overtime && rule.params.exclude_overtime) continue;
    if (!windowMatches(rule, seg, ctx)) continue;
    out.push({
      rule,
      payCode: rule.params.pay_code,
      rateOre: amountRate(rule.params.amount, base),
      unit: "hours",
      factorBp: 10000,
      note: null,
    });
  }
  return out;
}

/** Stabling: replaces → exclusive → highest per group → additive. */
export function stack<C extends { rule: ResolvedRule; rateOre: number }>(
  candidates: readonly C[],
): C[] {
  const replaced = new Set(candidates.flatMap((c) => c.rule.stacking.replaces));
  let kept = candidates.filter((c) => !replaced.has(c.rule.id));
  const byStrength = (a: C, b: C) => b.rule.priority - a.rule.priority || b.rateOre - a.rateOre;
  const exclusive = kept.filter((c) => c.rule.stacking.mode === "exclusive").sort(byStrength);
  if (exclusive.length) return [exclusive[0]!];
  const highest = new Map<string, C>();
  kept = kept.filter((c) => {
    if (c.rule.stacking.mode !== "highest") return true;
    const g = c.rule.stacking.group ?? "default";
    const cur = highest.get(g);
    if (!cur || byStrength(c, cur) < 0) highest.set(g, c);
    return false;
  });
  return [...kept, ...highest.values()];
}

type Acc = { line: PayLine; minutes: number };

class LineBook {
  private readonly map = new Map<string, Acc>();
  constructor(private readonly labels: (code: string) => string) {}

  add(c: Candidate, minutes: number, interval: ExplainedInterval | null) {
    const key = `${c.payCode}|${c.rateOre}|${c.rule.id}|${c.unit}`;
    let acc = this.map.get(key);
    if (!acc) {
      acc = {
        minutes: 0,
        line: {
          payCode: c.payCode,
          label: this.labels(c.payCode),
          unit: c.unit,
          quantityMinutes: 0,
          rateOre: c.rateOre,
          amountOre: 0,
          explanation: {
            ruleId: c.rule.id,
            primitive: c.rule.primitive,
            source: c.rule.source,
            layer: c.rule.layers.at(-1)!,
            todoJura: c.rule.todo_jura,
            note: c.note,
            intervals: [],
          },
        },
      };
      this.map.set(key, acc);
    }
    acc.minutes += minutes;
    if (interval) {
      const last = acc.line.explanation.intervals.at(-1);
      if (
        last &&
        last.intervalId === interval.intervalId &&
        last.end === interval.start &&
        last.date === interval.date
      ) {
        last.end = interval.end;
        last.minutes += interval.minutes;
      } else acc.line.explanation.intervals.push({ ...interval });
    }
    acc.line.quantityMinutes =
      c.unit === "time_off_minutes"
        ? Math.round((acc.minutes * c.factorBp) / 10000)
        : c.unit === "fixed"
          ? 0
          : acc.minutes;
  }

  lines(): PayLine[] {
    return [...this.map.values()]
      .map(({ line, minutes }) => ({
        ...line,
        amountOre:
          line.unit === "hours"
            ? Math.round((line.quantityMinutes * line.rateOre) / 60)
            : line.unit === "fixed"
              ? line.rateOre * minutes // `minutes` counts shifts for fixed amounts
              : 0,
      }))
      .sort((a, b) => a.payCode.localeCompare(b.payCode) || a.rateOre - b.rateOre);
  }
}

const explained = (seg: Segment): ExplainedInterval => ({
  intervalId: seg.intervalId,
  date: seg.date,
  start: formatInstant(seg.start),
  end: formatInstant(seg.end),
  minutes: minutesOf(seg),
});

/**
 * Calculates pay lines for one employee and pay period:
 * round → segment → classify (overtime, windows, holidays) → stack → lines.
 * Every line carries the rule, layer and intervals it came from.
 */
export function calculatePay(input: CalcPayInput): PayResult {
  const ctx = new EngineContext(input);
  const { from, to } = input.period;
  const notes: PayNote[] = [];
  const planned = new Map(normalizeIntervals(input.planned ?? []).map((p) => [p.id, p]));
  const plannedSpans = [...planned.values()].map((p) => ({ start: p.start, end: p.end }));
  const worked = normalizeIntervals(input.worked).map((i) => applyRounding(ctx, i, planned));
  const absences = input.absences ?? [];

  // 1. Paid pieces → segments.
  let segments: Segment[] = [];
  for (const i of worked) {
    if (i.kind === "on_call" || i.end <= i.start) continue;
    const date = localDate(i.start, ctx.tz);
    const pieces = payPieces(i, ctx.rule(date, "break")?.params.paid ?? false);
    for (const piece of pieces) {
      for (const s of cutSpan(piece, boundaryCuts(piece, ctx, plannedSpans))) {
        const d = localDate(s.start, ctx.tz);
        segments.push({
          ...s,
          intervalId: i.id,
          kind: i.kind,
          date: d,
          holiday: isHolidayTime(ctx, d, s.start),
          overtime: null,
        });
      }
    }
  }

  // 2. Overtime (needs the whole unit, also outside the pay period).
  segments = markOvertime(segments, ctx, absences, plannedSpans);

  // 3. Candidates, stacking and lines – only inside the pay period.
  const labels = (code: string) => {
    for (const d of [from, to]) {
      const l = ctx.day(d)?.resolved.payCodes[code]?.label;
      if (l) return l;
    }
    return code;
  };
  const book = new LineBook(labels);
  const dailyMinutes: Record<IsoDate, number> = {};
  const missingRate = new Set<IsoDate>();

  for (const seg of segments.sort((a, b) => a.start - b.start)) {
    if (seg.date < from || seg.date > to) continue;
    const contract = ctx.contractOn(seg.date);
    if (!contract) {
      notes.push({
        code: "NO_CONTRACT",
        message: "Arbejdstid uden gyldig kontrakt er ikke beregnet.",
        date: seg.date,
      });
      continue;
    }
    const minutes = minutesOf(seg);
    dailyMinutes[seg.date] = (dailyMinutes[seg.date] ?? 0) + minutes;
    const rate = baseRate(ctx, seg.date, contract);
    if (!rate) {
      missingRate.add(seg.date);
      continue;
    }
    if (contract.payForm === "hourly") {
      book.add(
        {
          rule: rate.rule,
          payCode: rate.rule.params.pay_code,
          rateOre: rate.ore,
          unit: "hours",
          factorBp: 10000,
          note: null,
        },
        minutes,
        explained(seg),
      );
    }
    for (const c of stack(candidatesFor(seg, ctx, contract, rate.ore)))
      book.add(c, minutes, explained(seg));
  }
  for (const d of missingRate)
    notes.push({
      code: "NO_PAY_RATE",
      message: "Ingen lønsats fundet – tillæg i procent kan ikke beregnes.",
      date: d,
    });

  // 4. On-call (rådighed), call-out and minimum-shift guarantees.
  const callOuts = worked.filter((i) => i.kind === "call_out");
  for (const i of worked) {
    const date = localDate(i.start, ctx.tz);
    if (date < from || date > to) continue;
    const contract = ctx.contractOn(date);
    const rate = contract ? baseRate(ctx, date, contract) : null;
    if (!contract || !rate) continue;
    const onCall = ctx.rule(date, "on_call");
    const interval = {
      intervalId: i.id,
      date,
      start: formatInstant(i.start),
      end: formatInstant(i.end),
      minutes: minutesOf(i),
    };

    if (i.kind === "on_call" && onCall) {
      const busy = callOuts.reduce((s, c) => s + overlap(i, c), 0) / MINUTE;
      const minutes = minutesOf(i) - Math.round(busy);
      const c: Candidate = {
        rule: onCall,
        payCode: onCall.params.pay_code,
        rateOre: amountRate(onCall.params.amount, rate.ore),
        unit: "hours",
        factorBp: 10000,
        note: null,
      };
      book.add(c, minutes, interval);
    }
    const paidMinutes = payPieces(i, ctx.rule(date, "break")?.params.paid ?? false).reduce(
      (s, p) => s + minutesOf(p),
      0,
    );
    if (i.kind === "call_out" && onCall) {
      const paid = paidMinutes;
      const missing = onCall.params.call_out_min_minutes - paid;
      if (missing > 0) {
        book.add(
          {
            rule: onCall,
            payCode: onCall.params.call_out_guarantee_pay_code,
            rateOre: rate.ore,
            unit: "hours",
            factorBp: 10000,
            note: `Minimumsbetaling for tilkald: ${onCall.params.call_out_min_minutes} min.`,
          },
          missing,
          interval,
        );
      }
    }
    const minShift = ctx.rule(date, "min_shift");
    if (
      i.kind === "work" &&
      i.plannedShiftId &&
      minShift?.params.guarantee_pay &&
      contract.payForm === "hourly"
    ) {
      const missing = minShift.params.min_minutes - paidMinutes;
      if (missing > 0) {
        book.add(
          {
            rule: minShift,
            payCode: minShift.params.pay_code,
            rateOre: rate.ore,
            unit: "hours",
            factorBp: 10000,
            note: `Garanti for minimum vagtlængde: ${minShift.params.min_minutes} min.`,
          },
          missing,
          interval,
        );
      }
    }
  }

  // 4b. Supplements put on individual shifts (organization configuration).
  const byId = new Map(worked.map((i) => [i.id, i]));
  const supplementRule = (s: ShiftSupplementInput) =>
    ({
      id: `supplement:${s.id}`,
      primitive: "shift_supplement",
      source: s.source,
      todo_jura: null,
      priority: 0,
      stacking: { mode: "additive", group: null, replaces: [] },
      layers: [{ agreementId: "organization", version: 1 }],
    }) as unknown as ResolvedRule;
  for (const seg of segments) {
    if (seg.date < from || seg.date > to) continue;
    const interval = byId.get(seg.intervalId);
    const contract = ctx.contractOn(seg.date);
    if (!interval?.supplements.length || !contract) continue;
    const base = baseRate(ctx, seg.date, contract)?.ore ?? 0;
    for (const s of interval.supplements) {
      if (s.amount.type === "fixed") continue;
      const rateOre =
        s.amount.type === "ore_per_hour" ? s.amount.ore : Math.round((base * s.amount.bp) / 10000);
      book.add(
        {
          rule: supplementRule(s),
          payCode: s.payCode,
          rateOre,
          unit: "hours",
          factorBp: 10000,
          note: s.label,
        },
        minutesOf(seg),
        explained(seg),
      );
    }
  }
  for (const i of worked) {
    const date = localDate(i.start, ctx.tz);
    if (date < from || date > to) continue;
    for (const s of i.supplements) {
      if (s.amount.type !== "fixed") continue;
      book.add(
        {
          rule: supplementRule(s),
          payCode: s.payCode,
          rateOre: s.amount.ore,
          unit: "fixed",
          factorBp: 10000,
          note: s.label,
        },
        1,
        {
          intervalId: i.id,
          date,
          start: formatInstant(i.start),
          end: formatInstant(i.end),
          minutes: minutesOf(i),
        },
      );
    }
  }

  // 5. Absence.
  for (const a of absences) {
    for (const d of datesBetween(a.from < from ? from : a.from, a.to > to ? to : a.to)) {
      const contract = ctx.contractOn(d);
      const rule = ctx.rule(d, "absence");
      const type = rule?.params.types.find((t) => t.code === a.type);
      if (!contract || !rule || !type) {
        if (a.type !== "vacation")
          notes.push({
            code: "UNKNOWN_ABSENCE_TYPE",
            message: `Fraværstypen "${a.type}" findes ikke i overenskomsten.`,
            date: d,
          });
        continue;
      }
      const minutes = absenceMinutesOn(ctx, a, d);
      if (
        minutes <= 0 ||
        type.payment === "none" ||
        !type.pay_code ||
        contract.payForm !== "hourly"
      )
        continue;
      const rate = baseRate(ctx, d, contract);
      if (!rate) continue;
      book.add(
        {
          rule,
          payCode: type.pay_code,
          rateOre: rate.ore,
          unit: "hours",
          factorBp: 10000,
          note: type.label,
        },
        minutes,
        {
          intervalId: a.id,
          date: d,
          start: formatInstant(startOfLocalDay(d, ctx.tz)),
          end: formatInstant(startOfLocalDay(addDays(d, 1), ctx.tz)),
          minutes,
        },
      );
    }
  }

  return { lines: book.lines(), dailyMinutes, notes, resolutionWarnings: ctx.resolutionWarnings };
}
