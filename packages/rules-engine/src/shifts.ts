import { formatInstant, MINUTE, parseInstant } from "./time/local-time";
import type { ShiftSupplementInput, WorkIntervalInput } from "./model";

export type PlannedBreak = {
  /** Fixed start (ISO instant) or null when only the length is planned. */
  start: string | null;
  minutes: number;
  paid: boolean;
};

export type PlannedShift = {
  id: string;
  start: string;
  end: string;
  breaks?: PlannedBreak[];
  /** Legacy: a single unplaced, unpaid break. */
  breakMinutes?: number;
  kind?: "work" | "on_call";
  supplements?: ShiftSupplementInput[];
};

/**
 * Converts planned shifts to engine intervals. Breaks with a fixed start keep
 * it; breaks without a start are spread evenly over the shift (their centres
 * at 1/(n+1), 2/(n+1), …) – an assumption used for validation.
 */
export function shiftsToIntervals(shifts: readonly PlannedShift[]): WorkIntervalInput[] {
  return shifts.map((s) => {
    const start = parseInstant(s.start);
    const end = parseInstant(s.end);
    const planned: PlannedBreak[] =
      s.breaks ?? (s.breakMinutes ? [{ start: null, minutes: s.breakMinutes, paid: false }] : []);
    const unplaced = planned.filter((b) => b.start === null);
    const length = end - start;
    const breaks = planned
      .map((b) => {
        const ms = b.minutes * MINUTE;
        if (ms <= 0 || ms >= length) return null;
        let from: number;
        if (b.start !== null) from = parseInstant(b.start);
        else {
          const k = unplaced.indexOf(b);
          from = start + (length * (k + 1)) / (unplaced.length + 1) - ms / 2;
        }
        from = Math.min(Math.max(from, start), end - ms);
        return { start: formatInstant(from), end: formatInstant(from + ms), paid: b.paid };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.start.localeCompare(b.start));
    return {
      id: s.id,
      start: s.start,
      end: s.end,
      kind: s.kind ?? "work",
      breaks,
      plannedShiftId: s.id,
      supplements: s.supplements ?? [],
    };
  });
}
