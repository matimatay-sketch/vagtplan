/**
 * The built-in schedule proposal (no AI): shift templates are spread over the
 * week so each employee comes as close as possible to their weekly norm,
 * around absence, existing shifts and wishes for time off. Pure and
 * deterministic: the same week gives the same proposal.
 *
 * It knows no working-time rules. The rules engine checks the result, and
 * combinations it turns down come back as `forbidden` for another round.
 */

export type PlanTemplate = {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Paid minutes (length minus unpaid breaks). */
  paidMinutes: number;
};

export type PlanEmployee = {
  id: string;
  name: string;
  /** Weekly norm in minutes (null: not planned). */
  targetMinutes: number | null;
  /** Paid minutes already planned in the week. */
  alreadyMinutes: number;
  /** Dates that are off limits (absence, an existing shift, a whole-day wish for time off). */
  busyDates: readonly string[];
  /** Part-day wishes for time off. */
  unavailable: readonly { date: string; from: string; to: string }[];
  /** Days the employee would like to work. */
  preferredDates: readonly string[];
};

export type PlannedShift = {
  employeeId: string;
  templateId: string;
  date: string;
  start: string;
  end: string;
  endsNextDay: boolean;
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The template's minutes on its day; a shift over midnight runs past 1440. */
function span(t: PlanTemplate): [number, number] {
  const s = toMin(t.start);
  const e = toMin(t.end);
  return [s, e <= s ? e + 1440 : e];
}

export function autoSchedule(input: {
  dates: readonly string[];
  templates: readonly PlanTemplate[];
  employees: readonly PlanEmployee[];
  /** "employeeId|date|templateId" combinations not to use again. */
  forbidden?: readonly string[];
}): {
  shifts: PlannedShift[];
  summary: { employeeId: string; targetMinutes: number | null; plannedMinutes: number }[];
} {
  const forbidden = new Set(input.forbidden ?? []);
  const templates = [...input.templates];
  const perDay = new Map<string, number>();
  const perSlot = new Map<string, number>();
  const shifts: PlannedShift[] = [];
  const state = [...input.employees]
    .sort((a, b) => a.name.localeCompare(b.name, "da") || a.id.localeCompare(b.id))
    .map((e) => ({
      e,
      planned: e.alreadyMinutes,
      taken: new Set(e.busyDates),
      done: e.targetMinutes === null || e.targetMinutes <= 0,
    }));

  const fits = (e: PlanEmployee, date: string, t: PlanTemplate) => {
    const [s, end] = span(t);
    return !e.unavailable.some(
      (u) => u.date === date && toMin(u.from) < end && s < (toMin(u.to) || 1440),
    );
  };

  for (;;) {
    // The employee furthest from their norm (relative), then by name.
    const open = state.filter((x) => !x.done);
    if (open.length === 0) break;
    const x = open.reduce((best, cur) => {
      const left = (y: typeof cur) => (y.e.targetMinutes! - y.planned) / y.e.targetMinutes!;
      return left(cur) > left(best) ? cur : best;
    });
    const remaining = x.e.targetMinutes! - x.planned;
    let choice: { date: string; t: PlanTemplate; score: number } | null = null;
    input.dates.forEach((date, di) => {
      if (x.taken.has(date)) return;
      templates.forEach((t, ti) => {
        // Only a shift that brings the employee closer to the norm.
        if (t.paidMinutes <= 0 || t.paidMinutes >= 2 * remaining) return;
        if (forbidden.has(`${x.e.id}|${date}|${t.id}`) || !fits(x.e, date, t)) return;
        const score =
          (perSlot.get(`${date}|${t.id}`) ?? 0) * 1000 +
          (perDay.get(date) ?? 0) * 100 -
          (x.e.preferredDates.includes(date) ? 50 : 0) +
          Math.max(0, t.paidMinutes - remaining) / 60 +
          di * 0.01 +
          ti * 0.001;
        if (!choice || score < choice.score) choice = { date, t, score };
      });
    });
    if (!choice) {
      x.done = true;
      continue;
    }
    const { date, t } = choice as { date: string; t: PlanTemplate };
    x.taken.add(date);
    x.planned += t.paidMinutes;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
    perSlot.set(`${date}|${t.id}`, (perSlot.get(`${date}|${t.id}`) ?? 0) + 1);
    shifts.push({
      employeeId: x.e.id,
      templateId: t.id,
      date,
      start: t.start,
      end: t.end,
      endsNextDay: toMin(t.end) <= toMin(t.start),
    });
  }

  shifts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.employeeId.localeCompare(b.employeeId),
  );
  return {
    shifts,
    summary: input.employees.map((e) => ({
      employeeId: e.id,
      targetMinutes: e.targetMinutes,
      plannedMinutes: state.find((x) => x.e.id === e.id)!.planned,
    })),
  };
}
