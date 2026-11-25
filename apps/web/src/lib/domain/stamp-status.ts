/**
 * Where a planned shift stands with stamping right now (the leader's
 * "Stemplinger"): before the start, late (no stamp a few minutes after the
 * start), stamped in, not stamped out (still open a while after the end), done,
 * or missing (ended without any stamp).
 */
export type StampStatus = "upcoming" | "late" | "in" | "not_out" | "done" | "missing";

export const LATE_AFTER_MINUTES = 5;
export const NOT_OUT_AFTER_MINUTES = 15;

export function stampStatus(
  plan: { start: string; end: string },
  entry: { start: string; end: string | null } | null,
  now: number,
): StampStatus {
  const start = Date.parse(plan.start);
  const end = Date.parse(plan.end);
  if (entry) {
    if (entry.end) return "done";
    return now > end + NOT_OUT_AFTER_MINUTES * 60_000 ? "not_out" : "in";
  }
  if (now >= end) return "missing";
  return now > start + LATE_AFTER_MINUTES * 60_000 ? "late" : "upcoming";
}
