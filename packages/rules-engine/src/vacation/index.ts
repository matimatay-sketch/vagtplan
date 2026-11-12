import { Temporal } from "temporal-polyfill";
import type { ParamsOf } from "../agreement/schema";
import type { IsoDate } from "../time/local-time";

export type VacationEntry = {
  kind: "vacation" | "extra";
  /** Posting date (end of month / end of employment, or the grant date). */
  date: IsoDate;
  days: number;
  /** First day of the holiday year the days belong to. */
  holidayYear: IsoDate;
  usableUntil: IsoDate;
  note: string;
};

type Employment = { employedFrom: IsoDate; employedTo: IsoDate | null };

const P = (d: IsoDate) => Temporal.PlainDate.from(d);
const min = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(a, b) <= 0 ? a : b;
const max = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(a, b) >= 0 ? a : b;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** First day of the (holiday) year that contains `date`, for a year starting on MM-DD. */
export function yearStartContaining(date: IsoDate, monthDay: string): IsoDate {
  const d = P(date);
  const thisYear = P(`${d.year}-${monthDay}`);
  return (
    Temporal.PlainDate.compare(d, thisYear) >= 0 ? thisYear : P(`${d.year - 1}-${monthDay}`)
  ).toString();
}

function monthlyPostings(
  ratePerMonth: number,
  employment: Employment,
  upTo: IsoDate,
): { date: IsoDate; days: number }[] {
  const out: { date: IsoDate; days: number }[] = [];
  const last = employment.employedTo ? min(P(employment.employedTo), P(upTo)) : P(upTo);
  let monthStart = P(employment.employedFrom).with({ day: 1 });
  while (Temporal.PlainDate.compare(monthStart, last) <= 0) {
    const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 });
    const from = max(monthStart, P(employment.employedFrom));
    const to = min(monthEnd, employment.employedTo ? P(employment.employedTo) : monthEnd);
    const endedThisMonth =
      employment.employedTo !== null && Temporal.PlainDate.compare(to, monthEnd) < 0;
    const postingDate = endedThisMonth ? to : monthEnd;
    if (Temporal.PlainDate.compare(postingDate, P(upTo)) > 0) break;
    const covered = from.until(to, { largestUnit: "days" }).days + 1;
    if (covered > 0)
      out.push({
        date: postingDate.toString(),
        days: round2((ratePerMonth * covered) / monthEnd.day),
      });
    monthStart = monthStart.add({ months: 1 });
  }
  return out;
}

/**
 * Vacation accrual as ledger postings (samtidighedsferie). Partial months are
 * prorated by calendar days. TODO(jura): verify proration rule for partial months.
 */
export function vacationAccrual(
  rule: ParamsOf<"vacation">,
  employment: Employment,
  upTo: IsoDate,
): VacationEntry[] {
  const entries: VacationEntry[] = [];
  for (const p of monthlyPostings(rule.days_per_month, employment, upTo)) {
    const holidayYear = yearStartContaining(p.date, rule.holiday_year_start);
    const usableUntil = P(holidayYear)
      .add({ years: 1 })
      .add({ months: rule.usage_extends_months })
      .subtract({ days: 1 });
    entries.push({
      kind: "vacation",
      date: p.date,
      days: p.days,
      holidayYear,
      usableUntil: usableUntil.toString(),
      note: "Optjent ferie",
    });
  }
  const extra = rule.extra_days;
  if (extra) {
    if (extra.accrual === "monthly") {
      for (const p of monthlyPostings(extra.days_per_year / 12, employment, upTo)) {
        const year = yearStartContaining(p.date, extra.year_start);
        entries.push({
          kind: "extra",
          date: p.date,
          days: p.days,
          holidayYear: year,
          usableUntil: P(year).add({ years: 1 }).subtract({ days: 1 }).toString(),
          note: "Optjente feriefridage",
        });
      }
    } else {
      let grant = P(yearStartContaining(employment.employedFrom, extra.year_start));
      if (Temporal.PlainDate.compare(grant, P(employment.employedFrom)) < 0)
        grant = grant.add({ years: 1 });
      while (
        Temporal.PlainDate.compare(grant, P(upTo)) <= 0 &&
        (employment.employedTo === null ||
          Temporal.PlainDate.compare(grant, P(employment.employedTo)) <= 0)
      ) {
        entries.push({
          kind: "extra",
          date: grant.toString(),
          days: extra.days_per_year,
          holidayYear: grant.toString(),
          usableUntil: grant.add({ years: 1 }).subtract({ days: 1 }).toString(),
          note: "Feriefridage",
        });
        grant = grant.add({ years: 1 });
      }
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
