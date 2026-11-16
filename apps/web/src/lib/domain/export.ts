/**
 * Configurable payroll export. The consultant sets the columns, the format and
 * the mapping from Turnus' pay codes to the payroll system's codes, so the
 * file fits the system it is imported into. Pure: money in øre, time in minutes.
 */
import { z } from "zod";

export const EXPORT_FIELDS = [
  "employee_number",
  "employee_name",
  "pay_code",
  "pay_code_external",
  "label",
  "quantity_hours",
  "quantity_minutes",
  "quantity_km",
  "quantity",
  "rate",
  "amount",
  "period_start",
  "period_end",
  "constant",
  "posting",
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];

const column = z
  .object({
    field: z.enum(EXPORT_FIELDS),
    header: z.string().max(60).default(""),
    /** Only for "constant". */
    value: z.string().max(60).optional(),
    /** Only for "posting": the dimension key (e.g. omkostningssted); the value's code is written. */
    dimension: z.string().max(40).optional(),
  })
  .refine((c) => c.field !== "posting" || Boolean(c.dimension), {
    message: "A posting column needs a dimension key",
    path: ["dimension"],
  });

export const exportSettingsSchema = z.object({
  separator: z.string().length(1).default(";"),
  decimal: z.enum([",", "."]).default(","),
  header: z.boolean().default(true),
  bom: z.boolean().default(true),
  lineEnding: z.enum(["crlf", "lf"]).default("crlf"),
  dateFormat: z.enum(["yyyy-mm-dd", "dd-mm-yyyy", "dd.mm.yyyy", "ddmmyyyy"]).default("yyyy-mm-dd"),
  /** One row per employee, pay code and rate, or one row per pay line. */
  grouping: z.enum(["employee_code", "line"]).default("employee_code"),
  /** Pay codes without a mapping: keep Turnus' code, or leave them out. */
  unmapped: z.enum(["keep", "skip"]).default("keep"),
  /** Turnus pay code → the payroll system's code; null leaves the code out. */
  codeMap: z.record(z.string(), z.string().max(40).nullable()).default({}),
  columns: z.array(column).min(1).max(30),
});
export type ExportSettings = z.output<typeof exportSettingsSchema>;

export const GENERIC_CSV: ExportSettings = exportSettingsSchema.parse({
  columns: [
    { field: "employee_number", header: "Medarbejdernr." },
    { field: "employee_name", header: "Navn" },
    { field: "pay_code_external", header: "Lønart" },
    { field: "label", header: "Tekst" },
    { field: "quantity_hours", header: "Timer" },
    { field: "rate", header: "Sats" },
    { field: "amount", header: "Beløb" },
    { field: "period_start", header: "Fra" },
    { field: "period_end", header: "Til" },
  ],
});

export type ExportRow = {
  employeeNumber: string;
  employeeName: string;
  payCode: string;
  label: string;
  unit: "hours" | "time_off_minutes" | "fixed" | "km";
  /** Minutes; metres for km; 0 for fixed amounts. */
  quantityMinutes: number;
  rateOre: number;
  amountOre: number;
  periodStart: string;
  periodEnd: string;
  /** dimension key → value code */
  posting?: Record<string, string>;
};

/** 450 min → "7,50"; øre 112500 → "1125,00" (two decimals, integer maths). */
function hundredths(value: number, decimal: string): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, "0")}`;
}
const hours = (minutes: number, decimal: string) =>
  hundredths(Math.round((minutes * 100) / 60), decimal);
/** 42 500 m → "42,50" km. */
const km = (meters: number, decimal: string) => hundredths(Math.round(meters / 10), decimal);
const isTime = (r: { unit: string }) => r.unit === "hours" || r.unit === "time_off_minutes";

function date(iso: string, format: ExportSettings["dateFormat"]): string {
  const [y, m, d] = iso.split("-") as [string, string, string];
  if (format === "dd-mm-yyyy") return `${d}-${m}-${y}`;
  if (format === "dd.mm.yyyy") return `${d}.${m}.${y}`;
  if (format === "ddmmyyyy") return `${d}${m}${y}`;
  return iso;
}

function quote(value: string, separator: string): string {
  return /["\r\n]/.test(value) || value.includes(separator)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

const postingKey = (p: Record<string, string> | undefined) =>
  Object.keys(p ?? {})
    .sort()
    .map((k) => `${k}=${p![k]}`)
    .join("&");

export function renderExport(
  settings: ExportSettings,
  rows: readonly ExportRow[],
): { text: string; rowCount: number; skippedCodes: string[] } {
  const skipped = new Set<string>();
  const mapped = rows.flatMap((r) => {
    const has = Object.prototype.hasOwnProperty.call(settings.codeMap, r.payCode);
    const external = has
      ? settings.codeMap[r.payCode]
      : settings.unmapped === "keep"
        ? r.payCode
        : null;
    if (external === null || external === undefined) {
      skipped.add(r.payCode);
      return [];
    }
    return [{ ...r, external }];
  });

  let out = mapped;
  if (settings.grouping === "employee_code") {
    const groups = new Map<string, (typeof mapped)[number]>();
    for (const r of mapped) {
      const key = `${r.employeeNumber}|${r.external}|${r.rateOre}|${postingKey(r.posting)}`;
      const g = groups.get(key);
      if (g) {
        g.quantityMinutes += r.quantityMinutes;
        g.amountOre += r.amountOre;
      } else groups.set(key, { ...r });
    }
    out = [...groups.values()].sort(
      (a, b) =>
        a.employeeNumber.localeCompare(b.employeeNumber, "da", { numeric: true }) ||
        a.external.localeCompare(b.external, "da", { numeric: true }) ||
        a.rateOre - b.rateOre ||
        postingKey(a.posting).localeCompare(postingKey(b.posting), "da", { numeric: true }),
    );
  } else {
    out = [...mapped].sort((a, b) =>
      a.employeeNumber.localeCompare(b.employeeNumber, "da", { numeric: true }),
    );
  }

  const value = (r: (typeof out)[number], c: ExportSettings["columns"][number]): string => {
    switch (c.field) {
      case "employee_number":
        return r.employeeNumber;
      case "employee_name":
        return r.employeeName;
      case "pay_code":
        return r.payCode;
      case "pay_code_external":
        return r.external;
      case "label":
        return r.label;
      case "quantity_hours":
        return r.unit === "km" ? "" : hours(r.quantityMinutes, settings.decimal);
      case "quantity_minutes":
        return r.unit === "km" ? "" : String(r.quantityMinutes);
      case "quantity_km":
        return r.unit === "km" ? km(r.quantityMinutes, settings.decimal) : "";
      case "quantity":
        return isTime(r)
          ? hours(r.quantityMinutes, settings.decimal)
          : r.unit === "km"
            ? km(r.quantityMinutes, settings.decimal)
            : "";
      case "rate":
        return hundredths(r.rateOre, settings.decimal);
      case "amount":
        return hundredths(r.amountOre, settings.decimal);
      case "period_start":
        return date(r.periodStart, settings.dateFormat);
      case "period_end":
        return date(r.periodEnd, settings.dateFormat);
      case "constant":
        return c.value ?? "";
      case "posting":
        return r.posting?.[c.dimension ?? ""] ?? "";
    }
  };

  const eol = settings.lineEnding === "crlf" ? "\r\n" : "\n";
  const lines: string[] = [];
  if (settings.header)
    lines.push(
      settings.columns.map((c) => quote(c.header, settings.separator)).join(settings.separator),
    );
  for (const r of out)
    lines.push(
      settings.columns.map((c) => quote(value(r, c), settings.separator)).join(settings.separator),
    );
  return {
    text: (settings.bom ? "﻿" : "") + lines.map((l) => l + eol).join(""),
    rowCount: out.length,
    skippedCodes: [...skipped].sort(),
  };
}
