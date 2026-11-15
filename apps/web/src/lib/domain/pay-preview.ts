/**
 * A pay preview for the approval list: which pay codes the week's time
 * activates, why (rule, source, layer and time spans, so the calculation can
 * be checked), per registration, and summed for a department. Pure; minutes and øre.
 */
export type Why = { ruleId: string; source: string; layer: string; note: string | null };

export type PreviewLine = {
  payCode: string;
  label: string;
  unit: "hours" | "time_off_minutes" | "fixed";
  quantityMinutes: number;
  rateOre: number;
  amountOre: number;
  why: Why;
  intervals: { intervalId: string; minutes: number; start?: string; end?: string }[];
};

export type CodeTotal = {
  payCode: string;
  label: string;
  unit: PreviewLine["unit"];
  minutes: number;
  amountOre: number;
};

export type PreviewCode = CodeTotal & {
  /** The rules that activated the pay code (once per rule). */
  why: Why[];
  /** The time spans it covers. */
  intervals: { start: string; end: string; minutes: number }[];
};

/** A row of the summary table: one per pay code and rate. */
export type SummaryRow = CodeTotal & { rateOre: number };

export type PayPreview = {
  codes: PreviewCode[];
  rows: SummaryRow[];
  /** Registration id → its pay codes and minutes. */
  byEntry: Record<string, { payCode: string; minutes: number }[]>;
};

const byCode = (a: { payCode: string }, b: { payCode: string }) =>
  a.payCode.localeCompare(b.payCode);

export function previewFromLines(lines: readonly PreviewLine[]): PayPreview {
  const codes = new Map<string, PreviewCode>();
  const entries = new Map<string, Map<string, number>>();
  const rows = new Map<string, SummaryRow>();
  for (const l of lines) {
    addRow(rows, { ...l, minutes: l.quantityMinutes });
    const c = codes.get(l.payCode) ?? {
      payCode: l.payCode,
      label: l.label,
      unit: l.unit,
      minutes: 0,
      amountOre: 0,
      why: [],
      intervals: [],
    };
    c.minutes += l.quantityMinutes;
    c.amountOre += l.amountOre;
    if (!c.why.some((w) => w.ruleId === l.why.ruleId && w.layer === l.why.layer)) c.why.push(l.why);
    for (const i of l.intervals) {
      if (i.start && i.end) c.intervals.push({ start: i.start, end: i.end, minutes: i.minutes });
      const e = entries.get(i.intervalId) ?? new Map<string, number>();
      e.set(l.payCode, (e.get(l.payCode) ?? 0) + i.minutes);
      entries.set(i.intervalId, e);
    }
    codes.set(l.payCode, c);
  }
  return {
    codes: [...codes.values()].sort(byCode),
    rows: sortedRows(rows),
    byEntry: Object.fromEntries(
      [...entries].map(([id, m]) => [
        id,
        [...m].map(([payCode, minutes]) => ({ payCode, minutes })).sort(byCode),
      ]),
    ),
  };
}

/** Pay codes summed over several employees (e.g. a department). */
export function sumPreviews(previews: readonly PayPreview[]): CodeTotal[] {
  const out = new Map<string, CodeTotal>();
  for (const p of previews)
    for (const c of p.codes) {
      const t = out.get(c.payCode) ?? {
        payCode: c.payCode,
        label: c.label,
        unit: c.unit,
        minutes: 0,
        amountOre: 0,
      };
      t.minutes += c.minutes;
      t.amountOre += c.amountOre;
      out.set(c.payCode, t);
    }
  return [...out.values()].sort(byCode);
}

function addRow(rows: Map<string, SummaryRow>, x: SummaryRow) {
  const key = `${x.payCode}|${x.rateOre}`;
  const row = rows.get(key) ?? {
    payCode: x.payCode,
    label: x.label,
    unit: x.unit,
    minutes: 0,
    rateOre: x.rateOre,
    amountOre: 0,
  };
  row.minutes += x.minutes;
  row.amountOre += x.amountOre;
  rows.set(key, row);
}

const sortedRows = (rows: Map<string, SummaryRow>) =>
  [...rows.values()].sort((a, b) => a.payCode.localeCompare(b.payCode) || a.rateOre - b.rateOre);

/** Summary rows summed over several employees (e.g. a department). */
export function sumRows(previews: readonly PayPreview[]): SummaryRow[] {
  const rows = new Map<string, SummaryRow>();
  for (const p of previews) for (const r of p.rows) addRow(rows, r);
  return sortedRows(rows);
}
