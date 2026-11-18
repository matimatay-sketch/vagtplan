/**
 * Project allocation of a shift. A row is either a time span (start_at/end_at),
 * a number of minutes, or "the rest of the shift" (neither). Minutes are
 * paid work minutes: unpaid breaks are deducted.
 */
export type ProjectAllocation = {
  /** null: time without a project (e.g. another posting row). */
  project_id: string | null;
  start_at: string | null;
  end_at: string | null;
  minutes: number | null;
};

type ShiftLike = {
  start: string;
  end: string;
  breaks: { start_at: string | null; minutes: number; paid: boolean }[];
};

const ms = (iso: string) => new Date(iso).getTime();
const MIN = 60_000;

function paidMinutes(s: ShiftLike): number {
  const unpaid = s.breaks.filter((b) => !b.paid).reduce((t, b) => t + b.minutes, 0);
  return Math.round((ms(s.end) - ms(s.start)) / MIN) - unpaid;
}

/** Any allocation row: a time span, a number of minutes, or the rest. */
export type AllocationSpan = {
  start_at: string | null;
  end_at: string | null;
  minutes: number | null;
};

function spanMinutes(s: ShiftLike, a: AllocationSpan): number {
  const from = ms(a.start_at!);
  const to = ms(a.end_at!);
  const unpaidInside = s.breaks
    .filter((b) => !b.paid && b.start_at)
    .reduce((t, b) => {
      const bs = ms(b.start_at!);
      const be = bs + b.minutes * MIN;
      return t + Math.max(0, Math.min(be, to) - Math.max(bs, from));
    }, 0);
  return Math.round((to - from - unpaidInside) / MIN);
}

export type ProjectMinutes = { projectId: string | null; minutes: number };

/** Paid minutes per project (null = without project), in first-appearance order. */
export function projectMinutes(
  s: ShiftLike,
  allocations: readonly ProjectAllocation[],
): ProjectMinutes[] {
  const total = paidMinutes(s);
  const out = new Map<string | null, number>();
  const add = (id: string | null, m: number) => out.set(id, (out.get(id) ?? 0) + m);
  let used = 0;
  let remainder: string | null = null;
  for (const a of allocations) {
    if (a.start_at && a.end_at) {
      const m = spanMinutes(s, a);
      add(a.project_id, m);
      used += m;
    } else if (a.minutes !== null) {
      add(a.project_id, a.minutes);
      used += a.minutes;
    } else {
      remainder = a.project_id;
      if (!out.has(a.project_id)) out.set(a.project_id, 0);
    }
  }
  const rest = Math.max(0, total - used);
  if (rest > 0 || remainder !== null) add(remainder, rest);
  return [...out.entries()]
    .filter(([, m]) => m > 0)
    .map(([projectId, minutes]) => ({ projectId, minutes }));
}

export type AllocationProblem = "outside" | "overlap" | "two_remainders" | "too_many_minutes";

export function allocationProblems<T extends AllocationSpan>(
  s: ShiftLike,
  allocations: readonly T[],
): AllocationProblem[] {
  const problems = new Set<AllocationProblem>();
  const spans = allocations
    .filter((a) => a.start_at && a.end_at)
    .map((a) => [ms(a.start_at!), ms(a.end_at!)] as const);
  for (const [from, to] of spans)
    if (from < ms(s.start) || to > ms(s.end) || to <= from) problems.add("outside");
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i]![0] < sorted[i - 1]![1]) problems.add("overlap");
  if (allocations.filter((a) => !(a.start_at && a.end_at) && a.minutes === null).length > 1)
    problems.add("two_remainders");
  const fixed = allocations.reduce(
    (t, a) =>
      t +
      (a.start_at && a.end_at && !problems.has("outside") ? spanMinutes(s, a) : (a.minutes ?? 0)),
    0,
  );
  if (fixed > paidMinutes(s)) problems.add("too_many_minutes");
  return [...problems];
}
