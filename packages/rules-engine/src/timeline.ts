import { parseInstant, type Instant, MINUTE } from "./time/local-time";
import type { WorkIntervalInput } from "./model";

export type Span = { start: Instant; end: Instant };

export type WorkInterval = Span & {
  id: string;
  kind: "work" | "on_call" | "call_out";
  breaks: Span[];
  plannedShiftId: string | null;
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
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export const minutesOf = (s: Span) => Math.round((s.end - s.start) / MINUTE);

export function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Work time of an interval minus its breaks (unpaid or paid – working-time rules ignore breaks). */
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
