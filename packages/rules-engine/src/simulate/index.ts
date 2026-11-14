import type { AgreementDocument } from "../agreement/schema";
import { calculatePay, type PayResult } from "../pay";
import { validateSchedule, type Violation } from "../validate";
import type { AbsenceInput, EngineInput, WorkIntervalInput } from "../model";
import { addDays, type IsoDate } from "../time/local-time";

export type SimulationSide = { pay: PayResult; violations: Violation[]; totalOre: number };

export type SimulationResult = {
  before: SimulationSide;
  after: SimulationSide;
  diff: { payCode: string; beforeOre: number; afterOre: number; deltaOre: number }[];
};

export type SimulateInput = EngineInput & {
  weekStart: IsoDate;
  worked: WorkIntervalInput[];
  planned?: WorkIntervalInput[];
  absences?: AbsenceInput[];
  /** The edited document; replaces the version with the same id and version number (or is added). */
  replace: AgreementDocument;
  /**
   * "What if the employee were on it": put the employee's contracts on the
   * edited document as their agreement or as their local agreement.
   */
  assign?: "agreement" | "local";
};

function side(input: EngineInput, s: SimulateInput): SimulationSide {
  const to = addDays(s.weekStart, 6);
  const pay = calculatePay({
    ...input,
    worked: s.worked,
    planned: s.planned ?? [],
    absences: s.absences ?? [],
    period: { from: s.weekStart, to },
  });
  const { violations } = validateSchedule({
    ...input,
    intervals: s.worked,
    absences: s.absences ?? [],
    from: s.weekStart,
    to,
  });
  return { pay, violations, totalOre: pay.lines.reduce((sum, l) => sum + l.amountOre, 0) };
}

/** Runs a test week with the current documents and with one edited document. */
export function simulateWeek(s: SimulateInput): SimulationResult {
  const registry = { ...s.registry };
  const versions = (registry[s.replace.id] ?? []).filter((d) => d.version !== s.replace.version);
  registry[s.replace.id] = [...versions, s.replace];
  const before = side(s, s);
  const contracts = s.assign
    ? s.contracts.map((c) =>
        s.assign === "agreement"
          ? { ...c, agreementId: s.replace.id }
          : { ...c, localAgreementId: s.replace.id },
      )
    : s.contracts;
  const after = side({ ...s, registry, contracts }, s);

  const totals = (r: SimulationSide) => {
    const m = new Map<string, number>();
    for (const l of r.pay.lines) m.set(l.payCode, (m.get(l.payCode) ?? 0) + l.amountOre);
    return m;
  };
  const b = totals(before);
  const a = totals(after);
  const codes = [...new Set([...b.keys(), ...a.keys()])].sort();
  const diff = codes
    .map((payCode) => ({
      payCode,
      beforeOre: b.get(payCode) ?? 0,
      afterOre: a.get(payCode) ?? 0,
      deltaOre: (a.get(payCode) ?? 0) - (b.get(payCode) ?? 0),
    }))
    .filter((d) => d.deltaOre !== 0);
  return { before, after, diff };
}
