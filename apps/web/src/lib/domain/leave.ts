/**
 * Leave ledger helpers. Days are whole hundredths (2.08 days = 208).
 * Browser-safe and pure.
 */
export type Posting = {
  account: string;
  kind: "accrual" | "usage" | "reversal" | "transfer" | "payout" | "adjustment";
  periodStart: string;
  usableUntil: string;
  hundredths: number;
};

export type Balance = {
  account: string;
  periodStart: string;
  usableUntil: string;
  earned: number;
  /** Used minus reversed. */
  used: number;
  /** Transfers, payouts and adjustments. */
  other: number;
  balance: number;
};

/** Balances per account and period, always the sum of the postings. */
export function balances(postings: readonly Posting[]): Balance[] {
  const map = new Map<string, Balance>();
  for (const x of postings) {
    const key = `${x.account}|${x.periodStart}`;
    const b = map.get(key) ?? {
      account: x.account,
      periodStart: x.periodStart,
      usableUntil: x.usableUntil,
      earned: 0,
      used: 0,
      other: 0,
      balance: 0,
    };
    if (x.kind === "accrual") b.earned += x.hundredths;
    else if (x.kind === "usage" || x.kind === "reversal") b.used -= x.hundredths;
    else b.other += x.hundredths;
    b.balance += x.hundredths;
    map.set(key, b);
  }
  return [...map.values()].sort(
    (a, b) => a.account.localeCompare(b.account) || a.periodStart.localeCompare(b.periodStart),
  );
}

type Period = { periodStart: string; usableUntil: string };

/**
 * Splits a usage over periods: those still usable on the date, the one
 * expiring first first. What is left is drawn from `fallback` (it may go
 * negative: vacation in advance).
 */
export function planUsage(
  periods: readonly (Period & { balance: number })[],
  hundredths: number,
  onDate: string,
  fallback: Period,
): (Period & { hundredths: number })[] {
  const out = new Map<string, Period & { hundredths: number }>();
  let left = hundredths;
  const usable = periods
    .filter((p) => p.usableUntil >= onDate && p.balance > 0)
    .sort((a, b) => a.usableUntil.localeCompare(b.usableUntil));
  for (const p of usable) {
    if (left <= 0) break;
    const take = Math.min(p.balance, left);
    out.set(p.periodStart, {
      periodStart: p.periodStart,
      usableUntil: p.usableUntil,
      hundredths: -take,
    });
    left -= take;
  }
  if (left > 0) {
    const f = out.get(fallback.periodStart);
    if (f) f.hundredths -= left;
    else out.set(fallback.periodStart, { ...fallback, hundredths: -left });
  }
  return [...out.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

/** 208 → "2,08", 2500 → "25", −50 → "−0,5". */
export function formatDays(hundredths: number): string {
  const sign = hundredths < 0 ? "−" : "";
  const abs = Math.abs(hundredths);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${frac ? `,${frac}` : ""}`;
}
