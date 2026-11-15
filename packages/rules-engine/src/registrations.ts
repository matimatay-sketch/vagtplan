import { EngineContext } from "./context";
import type { EngineInput, WorkIntervalInput } from "./model";
import { applyRounding } from "./pay";
import { normalizeIntervals } from "./timeline";
import { formatInstant, type IsoDate } from "./time/local-time";
import { minutesByDate } from "./validate";

export type RoundInput = EngineInput & {
  /** Registered (actual) time. */
  worked: WorkIntervalInput[];
  /** Planned shifts the registrations refer to (plannedShiftId). */
  planned?: WorkIntervalInput[];
};

/**
 * The times a registration is settled with: the `rounding` primitive (snap to
 * the planned shift within the tolerance, otherwise round to the unit).
 * Without a rounding rule the registration is returned unchanged.
 */
export function roundRegistrations(
  input: RoundInput,
): { id: string; start: string; end: string }[] {
  const ctx = new EngineContext(input);
  const planned = new Map(normalizeIntervals(input.planned ?? []).map((p) => [p.id, p]));
  const rounded = new Map(
    normalizeIntervals(input.worked).map((i) => {
      const r = applyRounding(ctx, i, planned);
      return [r.id, { id: r.id, start: formatInstant(r.start), end: formatInstant(r.end) }];
    }),
  );
  // Same order as the input.
  return input.worked.map((w) => rounded.get(w.id)!);
}

/**
 * Total daily working time per local date (the legal record requirement):
 * split at local midnight, minus unpaid breaks (paid breaks count when the
 * `break` primitive says so). On-call time is not working time.
 */
export function dailyWorkingMinutes(
  input: EngineInput & { intervals: WorkIntervalInput[] },
): Record<IsoDate, number> {
  const ctx = new EngineContext(input);
  const byDate = minutesByDate(normalizeIntervals(input.intervals), ctx);
  return Object.fromEntries([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
