import { Temporal } from "temporal-polyfill";
import { EngineContext } from "../context";
import type { EngineInput } from "../model";
import { addDays, isoWeekday, type IsoDate } from "../time/local-time";
import { vacationAccrual, yearStartContaining } from "./index";

/** An accrual posting. Days are whole hundredths (2.08 days = 208), never floats. */
export type LeavePosting = {
  /** "vacation", "extra" (feriefridage) or an absence type code with an entitlement. */
  account: string;
  /** Posting date. */
  date: IsoDate;
  hundredths: number;
  /** First day of the (holiday) year the days belong to. */
  periodStart: IsoDate;
  usableUntil: IsoDate;
  note: string;
};

const P = (d: IsoDate) => Temporal.PlainDate.from(d);
const later = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/**
 * Accruals for vacation, extra days and absence entitlements up to `upTo`,
 * contract by contract (each with the agreement in force at its start).
 * Upfront entitlements are granted once per period, in full, from the first
 * day of employment in that period. TODO(jura): proration of upfront
 * entitlements for employees who start during the period (jura-todo nr. 19).
 */
export function leaveAccruals(input: EngineInput, upTo: IsoDate): LeavePosting[] {
  const ctx = new EngineContext(input);
  const out: LeavePosting[] = [];
  const granted = new Set<string>();
  const contracts = [...input.contracts].sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  for (const original of contracts) {
    // Without an agreement version in force there are no rules to accrue by:
    // start when the contract's agreement starts.
    const versions = input.registry[original.agreementId] ?? [];
    const firstValid = versions.reduce<string | null>(
      (m, v) => (m === null || v.valid_from < m ? v.valid_from : m),
      null,
    );
    if (!firstValid) continue;
    const c = { ...original, validFrom: later(original.validFrom, firstValid) };
    if (c.validFrom > upTo || (c.validTo !== null && c.validTo < c.validFrom)) continue;
    const employment = { employedFrom: c.validFrom, employedTo: c.validTo };
    const vacation = ctx.rule(c.validFrom, "vacation");
    if (vacation) {
      for (const e of vacationAccrual(vacation.params, employment, upTo)) {
        if (e.kind === "extra" && vacation.params.extra_days?.accrual === "upfront") {
          // Upfront extra days: once per year across contracts.
          const key = `extra|${e.holidayYear}`;
          if (granted.has(key)) continue;
          granted.add(key);
        }
        out.push({
          account: e.kind === "vacation" ? "vacation" : "extra",
          date: e.date,
          hundredths: Math.round(e.days * 100),
          periodStart: e.holidayYear,
          usableUntil: e.usableUntil,
          note: e.note,
        });
      }
    }

    const absence = ctx.rule(c.validFrom, "absence");
    for (const t of absence?.params.types ?? []) {
      const ent = t.entitlement;
      if (!ent) continue;
      const yearStart =
        ent.period === "calendar_year" ? "01-01" : (vacation?.params.holiday_year_start ?? "09-01");
      const last = c.validTo && c.validTo < upTo ? c.validTo : upTo;
      for (
        let start = yearStartContaining(c.validFrom, yearStart);
        start <= last;
        start = P(start).add({ years: 1 }).toString()
      ) {
        const end = P(start).add({ years: 1 }).subtract({ days: 1 }).toString();
        if (ent.accrual === "upfront") {
          const key = `${t.code}|${start}`;
          const date = later(start, c.validFrom);
          if (granted.has(key) || date > last) continue;
          granted.add(key);
          out.push({
            account: t.code,
            date,
            hundredths: Math.round(ent.days * 100),
            periodStart: start,
            usableUntil: end,
            note: t.label,
          });
        } else {
          for (const e of vacationAccrual(
            {
              ...(vacation?.params ?? {
                holiday_year_start: yearStart,
                usage_extends_months: 0,
                main_holiday: { min_consecutive_days: 0, from: "01-01", to: "01-01" },
                vacation_pay_bp: null,
                vacation_supplement_bp: null,
                special_vacation_pay_bp: null,
              }),
              days_per_month: ent.days / 12,
              holiday_year_start: yearStart,
              usage_extends_months: 0,
              extra_days: null,
            },
            {
              employedFrom: later(start, c.validFrom),
              employedTo: c.validTo && c.validTo < end ? c.validTo : end,
            },
            last,
          ))
            out.push({
              account: t.code,
              date: e.date,
              hundredths: Math.round(e.days * 100),
              periodStart: start,
              usableUntil: end,
              note: t.label,
            });
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account));
}

/** Leave days in a period: Monday–Friday that are not holidays. */
export function leaveDays(input: EngineInput, from: IsoDate, to: IsoDate): IsoDate[] {
  const ctx = new EngineContext(input);
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1))
    if (isoWeekday(d) <= 5 && ctx.holiday(d) === null) out.push(d);
  return out;
}

/**
 * Hovedferie: the longest run of vacation days in the main holiday period of
 * the summer that belongs to the holiday year. Weekends and holidays neither
 * count nor break a run; a working day without vacation breaks it.
 */
export function mainHolidayStatus(
  input: EngineInput,
  /** A date in the holiday year (the year is found from the vacation rule). */
  onDate: IsoDate,
  vacationDates: readonly IsoDate[],
): { from: IsoDate; to: IsoDate; required: number; longest: number; ok: boolean } {
  const ctx = new EngineContext(input);
  const rule = ctx.rule(onDate, "vacation");
  const holidayYearStart = yearStartContaining(onDate, rule?.params.holiday_year_start ?? "09-01");
  const summer = P(holidayYearStart).add({ years: 1 }).year;
  const mh = rule?.params.main_holiday ?? { min_consecutive_days: 0, from: "05-01", to: "09-30" };
  const from = `${summer}-${mh.from}`;
  const to = `${summer}-${mh.to}`;
  const off = new Set(vacationDates);
  let run = 0;
  let longest = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isoWeekday(d) > 5 || ctx.holiday(d) !== null) continue;
    run = off.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return {
    from,
    to,
    required: mh.min_consecutive_days,
    longest,
    ok: longest >= mh.min_consecutive_days,
  };
}

/** Leave types an employee can request on a date: vacation, extra days and the agreement's absence types. */
export function leaveTypes(
  input: EngineInput,
  date: IsoDate,
): { code: string; label: string; hasBalance: boolean }[] {
  const ctx = new EngineContext(input);
  if (!ctx.contractOn(date)) return [];
  const out: { code: string; label: string; hasBalance: boolean }[] = [];
  const vacation = ctx.rule(date, "vacation");
  if (vacation) {
    out.push({ code: "vacation", label: "Ferie", hasBalance: true });
    if (vacation.params.extra_days)
      out.push({ code: "extra", label: "Feriefridag", hasBalance: true });
  }
  for (const t of ctx.rule(date, "absence")?.params.types ?? [])
    out.push({ code: t.code, label: t.label, hasBalance: t.entitlement !== null });
  return out;
}
