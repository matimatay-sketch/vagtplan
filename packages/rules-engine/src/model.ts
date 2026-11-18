import type { RuleLayer } from "./agreement/schema";
import type { AgreementRegistry } from "./agreement/resolve";
import type { IsoDate } from "./time/local-time";

export type PayForm = "hourly" | "monthly";

export type EmployeeFacts = {
  birthDate: IsoDate;
  schoolObligated: boolean;
  /** Last day of compulsory schooling, if known. */
  schoolObligationEndsOn: IsoDate | null;
};

export type ContractFacts = {
  id: string;
  validFrom: IsoDate;
  validTo: IsoDate | null;
  agreementId: string;
  localAgreementId: string | null;
  overrides: { rules: RuleLayer[] } | null;
  payForm: PayForm;
  weeklyNormMinutes: number;
  staffGroup: string | null;
  payStep: string | null;
};

export type BreakInput = {
  start: string;
  end: string;
  /** Paid break; default: the agreement's break rule decides. */
  paid?: boolean | null;
};

/** A supplement put on a specific shift (configured by the organization, not by an agreement). */
export type ShiftSupplementInput = {
  id: string;
  label: string;
  payCode: string;
  amount:
    | { type: "ore_per_hour"; ore: number }
    | { type: "percent_of_base"; bp: number }
    | { type: "fixed"; ore: number };
  source: string;
};

export type WorkIntervalInput = {
  id: string;
  /** ISO instants with zone, e.g. "2026-11-12T07:00:00Z". */
  start: string;
  end: string;
  /** work = ordinary work, on_call = rådighed, call_out = tilkald during rådighed. */
  kind?: "work" | "on_call" | "call_out";
  breaks?: BreakInput[];
  supplements?: ShiftSupplementInput[];
  /** Id of the planned shift this registration belongs to. */
  plannedShiftId?: string | null;
  /**
   * Posting (kontering) of the interval: rows of dimension values. A row is a
   * time span (start/end), a number of paid minutes, or the rest (neither).
   * Pay lines are split per posting. Values are opaque to the engine.
   */
  postings?: PostingRowInput[];
};

export type PostingRowInput = {
  values: Record<string, string>;
  start: string | null;
  end: string | null;
  minutes: number | null;
};

export type AbsenceInput = {
  id: string;
  /** Absence type code from the agreement's absence rule (or "vacation"). */
  type: string;
  from: IsoDate;
  to: IsoDate;
  /** Minutes per day; defaults to the contract's weekly norm / 5 on weekdays. */
  minutesPerDay?: number | null;
};

export type EngineInput = {
  timezone: string;
  registry: AgreementRegistry;
  employee: EmployeeFacts;
  contracts: ContractFacts[];
  /** Local dates that are school days (for young workers). Default: weekdays that are not holidays. */
  schoolDays?: IsoDate[] | null;
  /** Organization-wide settings layer (applied after local agreements, before the contract). */
  organizationLayer?: { rules: RuleLayer[] } | null;
};
