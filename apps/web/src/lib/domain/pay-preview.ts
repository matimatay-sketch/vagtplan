/**
 * A pay preview for the approval list: which pay codes the week's time
 * activates, in total and per registration. Pure; minutes and øre.
 */
export type PreviewLine = {
  payCode: string;
  label: string;
  unit: "hours" | "time_off_minutes" | "fixed";
  quantityMinutes: number;
  amountOre: number;
  intervals: { intervalId: string; minutes: number }[];
};

export type PayPreview = {
  codes: {
    payCode: string;
    label: string;
    unit: PreviewLine["unit"];
    minutes: number;
    amountOre: number;
  }[];
  /** Registration id → its pay codes and minutes. */
  byEntry: Record<string, { payCode: string; minutes: number }[]>;
};

export function previewFromLines(lines: readonly PreviewLine[]): PayPreview {
  const codes = new Map<string, PayPreview["codes"][number]>();
  const entries = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const c = codes.get(l.payCode) ?? {
      payCode: l.payCode,
      label: l.label,
      unit: l.unit,
      minutes: 0,
      amountOre: 0,
    };
    c.minutes += l.quantityMinutes;
    c.amountOre += l.amountOre;
    codes.set(l.payCode, c);
    for (const i of l.intervals) {
      const e = entries.get(i.intervalId) ?? new Map<string, number>();
      e.set(l.payCode, (e.get(l.payCode) ?? 0) + i.minutes);
      entries.set(i.intervalId, e);
    }
  }
  const byCode = (a: { payCode: string }, b: { payCode: string }) =>
    a.payCode.localeCompare(b.payCode);
  return {
    codes: [...codes.values()].sort(byCode),
    byEntry: Object.fromEntries(
      [...entries].map(([id, m]) => [
        id,
        [...m].map(([payCode, minutes]) => ({ payCode, minutes })).sort(byCode),
      ]),
    ),
  };
}
