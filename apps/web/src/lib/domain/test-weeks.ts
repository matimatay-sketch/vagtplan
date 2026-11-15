/**
 * Test weeks ("golden weeks") the consultant saves per agreement: a fictitious
 * employee, a week of shifts and absence, and the pay lines and violations
 * expected from the agreement text (calculated by hand). Pure.
 */
import {
  addDays,
  calculatePay,
  formatInstant,
  shiftsToIntervals,
  validateSchedule,
  wallTime,
  type AgreementRegistry,
  type EngineInput,
} from "@vagtplan/rules-engine";

export type TestCase = {
  name: string;
  /** Monday of the week. */
  weekStart: string;
  employee: { birthDate: string; schoolObligated: boolean };
  contract: {
    payForm: "hourly" | "monthly";
    weeklyNormMinutes: number;
    staffGroup: string | null;
    payStep: string | null;
  };
  /** Local date and times; an end at or before the start ends the next day. Unpaid break minutes. */
  shifts: {
    date: string;
    start: string;
    end: string;
    breakMinutes: number;
    kind: "work" | "on_call" | "call_out";
  }[];
  absences: { type: string; from: string; to: string }[];
  expected: Outcome;
};

export type Outcome = {
  /** Summed per pay code. */
  lines: { payCode: string; minutes: number; amountOre: number }[];
  /** Violation codes. */
  violations: string[];
};

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Runs the week with the employee on `agreementKey` (a local agreement on top of its parent). */
export function runTestCase(
  registry: AgreementRegistry,
  agreementKey: string,
  tc: TestCase,
  timezone: string,
): Outcome {
  const doc =
    (registry[agreementKey] ?? []).find((d) => d.valid_from <= tc.weekStart) ??
    registry[agreementKey]?.[0];
  const isLocal = doc?.kind === "local";
  const input: EngineInput = {
    timezone,
    registry,
    employee: {
      birthDate: tc.employee.birthDate,
      schoolObligated: tc.employee.schoolObligated,
      schoolObligationEndsOn: null,
    },
    contracts: [
      {
        id: "test",
        validFrom: "1900-01-01",
        validTo: null,
        agreementId: isLocal ? (doc.inherits_from ?? agreementKey) : agreementKey,
        localAgreementId: isLocal ? agreementKey : null,
        overrides: null,
        payForm: tc.contract.payForm,
        weeklyNormMinutes: tc.contract.weeklyNormMinutes,
        staffGroup: tc.contract.staffGroup,
        payStep: tc.contract.payStep,
      },
    ],
  };
  const intervals = shiftsToIntervals(
    tc.shifts.map((s, i) => {
      const endDate = toMinutes(s.end) <= toMinutes(s.start) ? addDays(s.date, 1) : s.date;
      return {
        id: `s${i}`,
        start: formatInstant(wallTime(s.date, s.start, timezone)),
        end: formatInstant(wallTime(endDate, s.end, timezone)),
        breaks: s.breakMinutes > 0 ? [{ start: null, minutes: s.breakMinutes, paid: false }] : [],
      };
    }),
  ).map((iv, i) => ({ ...iv, kind: tc.shifts[i]!.kind }));
  const absences = tc.absences.map((a, i) => ({
    id: `a${i}`,
    type: a.type,
    from: a.from,
    to: a.to,
  }));
  const to = addDays(tc.weekStart, 6);
  const pay = calculatePay({
    ...input,
    period: { from: tc.weekStart, to },
    worked: intervals,
    planned: [],
    absences,
  });
  const { violations } = validateSchedule({
    ...input,
    intervals,
    absences,
    from: tc.weekStart,
    to,
  });

  const sums = new Map<string, { payCode: string; minutes: number; amountOre: number }>();
  for (const l of pay.lines) {
    const s = sums.get(l.payCode) ?? { payCode: l.payCode, minutes: 0, amountOre: 0 };
    s.minutes += l.quantityMinutes;
    s.amountOre += l.amountOre;
    sums.set(l.payCode, s);
  }
  return {
    lines: [...sums.values()].sort((a, b) => a.payCode.localeCompare(b.payCode)),
    violations: [...new Set(violations.map((v) => v.code))].sort(),
  };
}

type Amounts = { minutes: number; amountOre: number };
export type Comparison = {
  ok: boolean;
  /** Only the pay codes that differ. */
  lines: { payCode: string; expected: Amounts | null; actual: Amounts | null }[];
  violations: { missing: string[]; unexpected: string[] };
};

export function compareTestCase(actual: Outcome, expected: Outcome): Comparison {
  const codes = [...new Set([...actual.lines, ...expected.lines].map((l) => l.payCode))].sort();
  const pick = (o: Outcome, code: string) => {
    const l = o.lines.find((x) => x.payCode === code);
    return l ? { minutes: l.minutes, amountOre: l.amountOre } : null;
  };
  const lines = codes.flatMap((payCode) => {
    const e = pick(expected, payCode);
    const a = pick(actual, payCode);
    return e && a && e.minutes === a.minutes && e.amountOre === a.amountOre
      ? []
      : [{ payCode, expected: e, actual: a }];
  });
  const violations = {
    missing: expected.violations.filter((v) => !actual.violations.includes(v)).sort(),
    unexpected: actual.violations.filter((v) => !expected.violations.includes(v)).sort(),
  };
  return {
    ok: lines.length === 0 && violations.missing.length === 0 && violations.unexpected.length === 0,
    lines,
    violations,
  };
}
