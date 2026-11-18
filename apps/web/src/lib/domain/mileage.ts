/**
 * Mileage (kørsel) and expenses (udlæg) as pay lines. Pure: distances in
 * metres, money in øre. The rates and the yearly km limit are data entered by
 * the consultant per year (`mileage_rate`); nothing is assumed here.
 */
import type { IsoDate } from "./civil-date";
import { da } from "@/lib/i18n/da";

export type MileageRate = {
  year: number;
  /** øre per km up to the yearly limit, and above it */
  highRateOre: number;
  lowRateOre: number;
  highLimitKm: number;
  payCodeHigh: string;
  payCodeLow: string;
  source: string;
};

export type ApprovedTrip = {
  id: string;
  date: IsoDate;
  meters: number;
  /** dimension id → value id (defaults already merged) */
  posting: Record<string, string>;
};

export type ApprovedExpense = {
  id: string;
  payCode: string;
  label: string;
  amountOre: number;
  posting: Record<string, string>;
};

/** A pay line in the same shape as the engine's (saved by save_pay_run). */
export type ExtraPayLine = {
  payCode: string;
  label: string;
  unit: "km" | "fixed";
  /** metres for km; 0 for fixed amounts */
  quantityMinutes: number;
  rateOre: number;
  amountOre: number;
  posting: Record<string, string>;
  explanation: {
    ruleId: string;
    primitive: "mileage" | "expense";
    source: string;
    layer: { agreementId: string; version: number };
    todoJura: null;
    note: string | null;
    intervals: [];
  };
};

const postingKey = (p: Record<string, string>) =>
  Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join("&");

const byCodeAndPosting = (a: ExtraPayLine, b: ExtraPayLine) =>
  a.payCode.localeCompare(b.payCode) || postingKey(a.posting).localeCompare(postingKey(b.posting));

/**
 * Trips (approved, in the period) as pay lines. `metersBefore` is what the
 * employee drove earlier in the same year (approved, before the period), so
 * the yearly limit is counted across periods. Trips are counted in date order;
 * the trip that crosses the limit is split.
 */
export function mileageLines(
  trips: readonly ApprovedTrip[],
  metersBefore: Record<number, number>,
  rates: readonly MileageRate[],
): { lines: ExtraPayLine[]; missingYears: number[] } {
  const rateOf = new Map(rates.map((r) => [r.year, r]));
  const used = new Map<number, number>(
    Object.entries(metersBefore).map(([y, m]) => [Number(y), m]),
  );
  const missing = new Set<number>();
  const acc = new Map<
    string,
    { rate: MileageRate; high: boolean; meters: number; posting: Record<string, string> }
  >();
  const sorted = [...trips].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const t of sorted) {
    const year = Number(t.date.slice(0, 4));
    const rate = rateOf.get(year);
    if (!rate) {
      missing.add(year);
      continue;
    }
    const before = used.get(year) ?? 0;
    const room = Math.max(0, rate.highLimitKm * 1000 - before);
    const high = Math.min(t.meters, room);
    used.set(year, before + t.meters);
    for (const [isHigh, meters] of [
      [true, high],
      [false, t.meters - high],
    ] as const) {
      if (meters <= 0) continue;
      const key = `${year}|${isHigh}|${postingKey(t.posting)}`;
      const a = acc.get(key);
      if (a) a.meters += meters;
      else acc.set(key, { rate, high: isHigh, meters, posting: t.posting });
    }
  }
  const t = da.expenses;
  const lines = [...acc.values()].map((a): ExtraPayLine => {
    const rateOre = a.high ? a.rate.highRateOre : a.rate.lowRateOre;
    return {
      payCode: a.high ? a.rate.payCodeHigh : a.rate.payCodeLow,
      label: a.high ? t.lineHigh : t.lineLow,
      unit: "km",
      quantityMinutes: a.meters,
      rateOre,
      amountOre: Math.round((a.meters * rateOre) / 1000),
      posting: a.posting,
      explanation: {
        ruleId: a.high ? "mileage_high" : "mileage_low",
        primitive: "mileage",
        source: a.rate.source,
        layer: { agreementId: t.ratesLayer, version: a.rate.year },
        todoJura: null,
        note: a.high ? t.noteHigh(a.rate.highLimitKm) : t.noteLow(a.rate.highLimitKm),
        intervals: [],
      },
    };
  });
  return { lines: lines.sort(byCodeAndPosting), missingYears: [...missing].sort() };
}

/** Expenses (approved, in the period) summed per pay code and posting. */
export function expenseLines(expenses: readonly ApprovedExpense[]): ExtraPayLine[] {
  const acc = new Map<string, ExtraPayLine>();
  for (const e of expenses) {
    const key = `${e.payCode}|${postingKey(e.posting)}`;
    const line = acc.get(key);
    if (line) line.amountOre += e.amountOre;
    else
      acc.set(key, {
        payCode: e.payCode,
        label: e.label,
        unit: "fixed",
        quantityMinutes: 0,
        rateOre: 0,
        amountOre: e.amountOre,
        posting: e.posting,
        explanation: {
          ruleId: "expense",
          primitive: "expense",
          source: da.expenses.expenseSource,
          layer: { agreementId: da.expenses.expensesLayer, version: 1 },
          todoJura: null,
          note: null,
          intervals: [],
        },
      });
  }
  return [...acc.values()].sort(byCodeAndPosting);
}

/** "42,5" → 42 500 m; "1.234,56" → 1 234 560 m; up to three decimals. */
export function parseKm(input: string): number | null {
  let s = input.trim().replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replaceAll(".", "");
  const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const meters = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
  return meters > 0 ? meters : null;
}

const kmFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 });
/** 42 500 m → "42,5 km". */
export const formatKm = (meters: number) => `${kmFormat.format(meters / 1000)} km`;
