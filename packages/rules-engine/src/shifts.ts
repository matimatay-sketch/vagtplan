import { formatInstant, MINUTE, parseInstant } from "./time/local-time";
import type { WorkIntervalInput } from "./model";

export type PlannedShift = {
  id: string;
  start: string;
  end: string;
  /** Planned break length; its placement is not planned. */
  breakMinutes?: number;
  kind?: "work" | "on_call";
};

/**
 * Converts planned shifts to engine intervals. A planned break has no fixed
 * placement, so it is put in the middle of the shift (assumption, used for
 * validation only).
 */
export function shiftsToIntervals(shifts: readonly PlannedShift[]): WorkIntervalInput[] {
  return shifts.map((s) => {
    const start = parseInstant(s.start);
    const end = parseInstant(s.end);
    const brk = (s.breakMinutes ?? 0) * MINUTE;
    const breaks =
      brk > 0 && brk < end - start
        ? [{ start: formatInstant(start + (end - start - brk) / 2), end: formatInstant(start + (end - start + brk) / 2) }]
        : [];
    return { id: s.id, start: s.start, end: s.end, kind: s.kind ?? "work", breaks, plannedShiftId: s.id };
  });
}
