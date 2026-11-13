import type { DbBreak } from "./breaks";

type Span = { start: string; end: string };
const MIN = 60_000;
const ms = (iso: string) => new Date(iso).getTime();

/** Minutes more (+) or less (−) than planned at the start and the end. */
export function deviation(actual: Span, plan: Span): { start: number; end: number; total: number } {
  const start = Math.round((ms(plan.start) - ms(actual.start)) / MIN);
  const end = Math.round((ms(actual.end) - ms(plan.end)) / MIN);
  return { start, end, total: start + end };
}

/** A saved registration needs a reason when it has no plan or differs from it. */
export function needsReason(actual: Span, plan: Span | null): boolean {
  return !plan || ms(actual.start) !== ms(plan.start) || ms(actual.end) !== ms(plan.end);
}

/** Length minus unpaid breaks, or null while the registration is open. */
export function entryMinutes(e: {
  start: string;
  end: string | null;
  breaks: readonly DbBreak[];
}): number | null {
  if (!e.end) return null;
  const unpaid = e.breaks.filter((b) => !b.paid).reduce((s, b) => s + b.minutes, 0);
  return Math.round((ms(e.end) - ms(e.start)) / MIN) - unpaid;
}
