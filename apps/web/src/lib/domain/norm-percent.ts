/**
 * Norm percent: the share of a shift that counts towards the employee's hours
 * norm (e.g. on-call at 33 %). A shift without its own value uses the
 * organization's default for its kind. Pure and browser-safe.
 */
export type ShiftKind = "work" | "on_call";

export type NormDefaults = {
  percent: Record<ShiftKind, number>;
  /** Whether the share is used when the pay calculation finds overtime. */
  inPay: Record<ShiftKind, boolean>;
};

/** As before the setting existed: work counts in full, on-call not at all, pay unchanged. */
export const DEFAULT_NORM: NormDefaults = {
  percent: { work: 100, on_call: 0 },
  inPay: { work: false, on_call: false },
};

export function normDefaultsFrom(
  s:
    | {
        norm_percent_work: number;
        norm_percent_on_call: number;
        norm_in_pay_work: boolean;
        norm_in_pay_on_call: boolean;
      }
    | null
    | undefined,
): NormDefaults {
  if (!s) return DEFAULT_NORM;
  return {
    percent: { work: s.norm_percent_work, on_call: s.norm_percent_on_call },
    inPay: { work: s.norm_in_pay_work, on_call: s.norm_in_pay_on_call },
  };
}

export type ShiftNorm = {
  kind: ShiftKind;
  norm_percent?: number | null;
  norm_in_pay?: boolean | null;
};

export const effectivePercent = (s: ShiftNorm, d: NormDefaults): number =>
  s.norm_percent ?? d.percent[s.kind];

export const effectiveInPay = (s: ShiftNorm, d: NormDefaults): boolean =>
  s.norm_in_pay ?? d.inPay[s.kind];

/** Minutes that count towards the norm (whole minutes). */
export const normMinutes = (minutes: number, percent: number): number =>
  Math.round((minutes * percent) / 100);

/**
 * The percent handed to the pay engine, or null when the engine's default
 * applies (work 100 %, on-call 0 %) because the share is not used in pay.
 */
export function payNormPercent(s: ShiftNorm, d: NormDefaults): number | null {
  return effectiveInPay(s, d) ? effectivePercent(s, d) : null;
}

/**
 * The percent for a registration in pay: the published plan's own values when
 * the plan is of the same kind, else the defaults. Call-out (tilkald during
 * rådighed) is work and keeps the engine's default (100 %).
 */
export function entryPayNormPercent(
  entryKind: "work" | "on_call" | "call_out",
  plan:
    { kind?: ShiftKind; norm_percent?: number | null; norm_in_pay?: boolean | null } | undefined,
  d: NormDefaults,
): number | null {
  if (entryKind === "call_out") return null;
  const own = plan && (plan.kind ?? "work") === entryKind ? plan : undefined;
  return payNormPercent(
    { kind: entryKind, norm_percent: own?.norm_percent, norm_in_pay: own?.norm_in_pay },
    d,
  );
}
