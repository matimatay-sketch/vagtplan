import { Temporal } from "temporal-polyfill";
import { buildHolidayCalendar, type HolidayInfo } from "./calendar/holidays";
import {
  resolveAgreement,
  type ResolvedAgreement,
  type ResolvedRule,
  type ResolutionWarning,
} from "./agreement/resolve";
import type { Primitive, Rule } from "./agreement/schema";
import type { ContractFacts, EngineInput } from "./model";
import { isoWeekday, yearOf, type IsoDate } from "./time/local-time";

/** Completed years; a 29 Feb birthday is reached on 1 Mar in non-leap years. */
export function ageOn(birthDate: IsoDate, on: IsoDate): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

type DayRules = { contract: ContractFacts; resolved: ResolvedAgreement } | null;

/** Per-date access to contract, merged rules, holidays and personal facts. Cached. */
export class EngineContext {
  readonly tz: string;
  private readonly dayCache = new Map<IsoDate, DayRules>();
  private readonly holidayCache = new Map<string, Map<IsoDate, HolidayInfo>>();
  private readonly warningKeys = new Set<string>();
  readonly resolutionWarnings: ResolutionWarning[] = [];

  constructor(readonly input: EngineInput) {
    this.tz = input.timezone;
  }

  contractOn(date: IsoDate): ContractFacts | null {
    return (
      this.input.contracts.find(
        (c) => c.validFrom <= date && (c.validTo === null || date <= c.validTo),
      ) ?? null
    );
  }

  /** The date seniority counts from: a contract's seniority date, else the first contract's start. */
  seniorityStart(): IsoDate | null {
    let out: IsoDate | null = null;
    for (const c of this.input.contracts) {
      const d = c.seniorityDate ?? c.validFrom;
      if (out === null || d < out) out = d;
    }
    return out;
  }

  /** The day the employee reaches `months` of seniority (null without contracts). */
  seniorityReached(months: number): IsoDate | null {
    const start = this.seniorityStart();
    return start === null ? null : Temporal.PlainDate.from(start).add({ months }).toString();
  }

  /** Whether the contract's agreement has a version on `date` (rules can be looked up). */
  hasRules(date: IsoDate): boolean {
    const c = this.contractOn(date);
    if (!c) return false;
    return (this.input.registry[c.agreementId] ?? []).some(
      (v) => v.valid_from <= date && (v.valid_to === null || date <= v.valid_to),
    );
  }

  day(date: IsoDate): DayRules {
    if (this.dayCache.has(date)) return this.dayCache.get(date)!;
    const contract = this.contractOn(date);
    let value: DayRules = null;
    if (contract) {
      const resolved = resolveAgreement(this.input.registry, {
        agreementId: contract.agreementId,
        localAgreementId: contract.localAgreementId,
        contractOverrides: contract.overrides,
        organizationLayer: this.input.organizationLayer ?? null,
        date,
      });
      for (const w of resolved.warnings) {
        const key = JSON.stringify(w);
        if (!this.warningKeys.has(key)) {
          this.warningKeys.add(key);
          this.resolutionWarnings.push(w);
        }
      }
      value = { contract, resolved };
    }
    this.dayCache.set(date, value);
    return value;
  }

  /**
   * Rules of a primitive that apply to the contract on `date` (applies_to
   * filtered), the most specific first: a rule limited to staff groups and/or
   * pay forms goes before a general one. Document order is kept among equals.
   */
  rules<P extends Primitive>(date: IsoDate, primitive: P): (ResolvedRule & Rule<P>)[] {
    const d = this.day(date);
    if (!d) return [];
    const specificity = (r: ResolvedRule) =>
      (r.applies_to.staff_groups === null ? 0 : 1) + (r.applies_to.pay_forms === null ? 0 : 1);
    return d.resolved.rules
      .filter(
        (r) =>
          r.primitive === primitive &&
          (r.applies_to.staff_groups === null ||
            r.applies_to.staff_groups.includes(d.contract.staffGroup ?? "")) &&
          (r.applies_to.pay_forms === null || r.applies_to.pay_forms.includes(d.contract.payForm)),
      )
      .map((r, i) => ({ r, i, s: specificity(r) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.r) as (ResolvedRule & Rule<P>)[];
  }

  rule<P extends Primitive>(date: IsoDate, primitive: P): (ResolvedRule & Rule<P>) | null {
    return this.rules(date, primitive)[0] ?? null;
  }

  holiday(date: IsoDate): HolidayInfo | null {
    const cal = this.rule(date, "holiday_calendar");
    if (!cal) return null;
    const key = `${JSON.stringify(cal.params)}|${yearOf(date)}`;
    let map = this.holidayCache.get(key);
    if (!map) {
      map = buildHolidayCalendar(cal.params, [yearOf(date)]);
      this.holidayCache.set(key, map);
    }
    return map.get(date) ?? null;
  }

  age(date: IsoDate): number {
    return ageOn(this.input.employee.birthDate, date);
  }

  schoolObligated(date: IsoDate): boolean {
    const e = this.input.employee;
    return (
      e.schoolObligated && (e.schoolObligationEndsOn === null || date <= e.schoolObligationEndsOn)
    );
  }

  /** School day: from input, otherwise Monday–Friday that is not a holiday (conservative default). */
  isSchoolDay(date: IsoDate): boolean {
    if (this.input.schoolDays) return this.input.schoolDays.includes(date);
    return isoWeekday(date) <= 5 && this.holiday(date) === null;
  }
}
