import { parseInstant, type Instant, MINUTE } from "./time/local-time";
import type { ShiftSupplementInput, WorkIntervalInput } from "./model";

export type Span = { start: Instant; end: Instant };

export type WorkInterval = Span & {
  id: string;
  kind: "work" | "on_call" | "call_out";
  breaks: (Span & { paid: boolean | null })[];
  plannedShiftId: string | null;
  /** Percent of the interval that counts towards the norm (see WorkIntervalInput). */
  normPercent: number;
  supplements: ShiftSupplementInput[];
  postings: PostingRow[];
  overtimeAsTimeOff: boolean;
};

export type PostingRow = {
  values: Record<string, string>;
  start: Instant | null;
  end: Instant | null;
  minutes: number | null;
};

export function normalizeIntervals(inputs: readonly WorkIntervalInput[]): WorkInterval[] {
  return inputs
    .map((i) => {
      const start = parseInstant(i.start);
      const end = parseInstant(i.end);
      if (end <= start) throw new Error(`Interval ${i.id} ends before it starts`);
      const breaks = (i.breaks ?? [])
        .map((b) => ({
          start: Math.max(start, parseInstant(b.start)),
          end: Math.min(end, parseInstant(b.end)),
          paid: b.paid ?? null,
        }))
        .filter((b) => b.end > b.start)
        .sort((a, b) => a.start - b.start);
      return {
        id: i.id,
        start,
        end,
        kind: i.kind ?? "work",
        breaks,
        plannedShiftId: i.plannedShiftId ?? null,
        normPercent: Math.max(0, i.normPercent ?? ((i.kind ?? "work") === "on_call" ? 0 : 100)),
        supplements: i.supplements ?? [],
        overtimeAsTimeOff: i.overtimeAsTimeOff ?? false,
        postings: (i.postings ?? []).map((p) => ({
          values: p.values,
          start: p.start && p.end ? parseInstant(p.start) : null,
          end: p.start && p.end ? parseInstant(p.end) : null,
          minutes: p.start && p.end ? null : p.minutes,
        })),
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export const minutesOf = (s: Span) => Math.round((s.end - s.start) / MINUTE);

export function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Paid time of an interval: minus breaks that are unpaid (per break, else `defaultPaid`). */
export function payPieces(i: WorkInterval, defaultPaid: boolean): Span[] {
  return workPieces({ ...i, breaks: i.breaks.filter((b) => !(b.paid ?? defaultPaid)) });
}

/**
 * Working time for the working-time rules: minus unpaid breaks, and minus paid
 * breaks too unless they count as working time.
 */
export function workingTimePieces(
  i: WorkInterval,
  defaultPaid: boolean,
  paidCountsAsWorkingTime: boolean,
): Span[] {
  return paidCountsAsWorkingTime ? payPieces(i, defaultPaid) : workPieces(i);
}

/** Time of an interval minus all its breaks. */
export function workPieces(i: WorkInterval): Span[] {
  const out: Span[] = [];
  let cursor = i.start;
  for (const b of i.breaks) {
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < i.end) out.push({ start: cursor, end: i.end });
  return out;
}

export function breakMinutes(i: WorkInterval): number {
  return i.breaks.reduce((sum, b) => sum + minutesOf(b), 0);
}

/** Merges overlapping/touching spans into blocks (envelopes). */
export function mergeSpans<T extends Span>(spans: readonly T[]): (Span & { members: T[] })[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: (Span & { members: T[] })[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      last.members.push(s);
    } else out.push({ start: s.start, end: s.end, members: [s] });
  }
  return out;
}

/** Free gaps between blocks inside a window. */
export function freeGaps(blocks: readonly Span[], window: Span): Span[] {
  const gaps: Span[] = [];
  let cursor = window.start;
  for (const b of blocks) {
    if (b.end <= window.start || b.start >= window.end) continue;
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

/** Splits spans at the given cut instants. */
export function cutSpan(span: Span, cuts: readonly Instant[]): Span[] {
  const points = [...new Set(cuts.filter((c) => c > span.start && c < span.end))].sort(
    (a, b) => a - b,
  );
  const out: Span[] = [];
  let cursor = span.start;
  for (const p of points) {
    out.push({ start: cursor, end: p });
    cursor = p;
  }
  out.push({ start: cursor, end: span.end });
  return out;
}
