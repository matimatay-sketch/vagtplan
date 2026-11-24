import { isValidIsoDate } from "./civil-date";
import { parseDanishDecimal } from "./numbers";
import { parseDaysToHundredths } from "@/lib/forms/absence";
import { toCsv } from "./csv";
import { da } from "@/lib/i18n/da";

/**
 * Reading CSV files for import (departments, employees, shifts, balances).
 * Pure and browser-safe: it only reads and checks the file. What a row means
 * (create or change, which department) is decided against the database later.
 */

export const IMPORT_KINDS = ["departments", "employees", "shifts", "balances"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** At most this many data lines per file. */
export const MAX_IMPORT_LINES = 5000;

const t = da.importCsv;

/** Excel saves Danish CSV files as Windows-1252; everything else is UTF-8. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

export type CsvRow = { line: number; cells: string[] };
export type ParsedCsv = { header: string[]; rows: CsvRow[] };

/** The separator is the one of ; , and tab that occurs most in the first line (outside quotes). */
function separatorOf(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const outside = first.replace(/"[^"]*"/g, "");
  const count = (c: string) => outside.split(c).length - 1;
  return [";", ",", "\t"].reduce((best, c) => (count(c) > count(best) ? c : best), ";");
}

/** RFC 4180-style parsing with line numbers (a quoted cell may span lines). Blank lines are skipped. */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const sep = separatorOf(text);
  const records: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const endRecord = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) records.push({ line: startLine, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        if (ch !== "\r") cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n") {
      endRecord();
      line++;
      startLine = line;
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || cells.length) endRecord();
  const [head, ...rows] = records;
  return { header: (head?.cells ?? []).map((h) => h.trim()), rows };
}

// ---------------------------------------------------------------- columns

type FieldType =
  | "text"
  | "date"
  | "time"
  | "email"
  | "hours"
  | "payForm"
  | "minutes"
  | "shiftKind"
  | "days"
  | "note";

type Field = {
  key: string;
  /** The column name in templates and messages. */
  label: string;
  /** Other names the column is known by (compared without case, spaces or signs). */
  aliases: string[];
  type: FieldType;
  /** Required on every line (some fields are required only for new rows: decided later). */
  required?: boolean;
  example: string;
};

const FIELDS: Record<ImportKind, Field[]> = {
  departments: [
    {
      key: "name",
      label: "navn",
      aliases: ["afdeling", "afdelingsnavn", "department", "name"],
      type: "text",
      required: true,
      example: "Køkken",
    },
    {
      key: "new_name",
      label: "nyt navn",
      aliases: ["omdøb til", "new name"],
      type: "text",
      example: "",
    },
  ],
  employees: [
    {
      key: "employee_number",
      label: "medarbejdernummer",
      aliases: ["medarbejdernr", "nr", "nummer", "lønnummer", "employee number"],
      type: "text",
      required: true,
      example: "1010",
    },
    { key: "first_name", label: "fornavn", aliases: ["first name"], type: "text", example: "Ole" },
    {
      key: "last_name",
      label: "efternavn",
      aliases: ["last name"],
      type: "text",
      example: "Hansen",
    },
    {
      key: "birth_date",
      label: "fødselsdato",
      aliases: ["født", "birth date"],
      type: "date",
      example: "03-02-1990",
    },
    { key: "email", label: "e-mail", aliases: ["mail"], type: "email", example: "ole@firma.dk" },
    {
      key: "phone",
      label: "telefon",
      aliases: ["tlf", "mobil", "phone"],
      type: "text",
      example: "12345678",
    },
    {
      key: "hired_on",
      label: "ansat dato",
      aliases: ["ansættelsesdato", "ansat", "hired on"],
      type: "date",
      example: "01-12-2026",
    },
    {
      key: "department",
      label: "afdeling",
      aliases: ["department"],
      type: "text",
      example: "Butik",
    },
    {
      key: "agreement",
      label: "overenskomst",
      aliases: ["agreement"],
      type: "text",
      example: "EKSEMPEL – Detail (fiktiv)",
    },
    {
      key: "weekly_minutes",
      label: "timer pr. uge",
      aliases: ["ugentlige timer", "timer", "weekly hours"],
      type: "hours",
      example: "37,5",
    },
    {
      key: "pay_form",
      label: "lønform",
      aliases: ["pay form"],
      type: "payForm",
      example: "timeløn",
    },
    {
      key: "pay_period_group",
      label: "lønperiode",
      aliases: ["lønperiodegruppe", "pay period"],
      type: "text",
      example: "Månedsløn",
    },
    {
      key: "contract_from",
      label: "kontrakt fra",
      aliases: ["kontraktstart", "contract from"],
      type: "date",
      example: "01-12-2026",
    },
  ],
  shifts: [
    {
      key: "employee_number",
      label: "medarbejdernummer",
      aliases: ["medarbejdernr", "nr", "employee number"],
      type: "text",
      example: "1002",
    },
    {
      key: "department",
      label: "afdeling",
      aliases: ["department"],
      type: "text",
      required: true,
      example: "Butik",
    },
    {
      key: "date",
      label: "dato",
      aliases: ["date"],
      type: "date",
      required: true,
      example: "07-12-2026",
    },
    {
      key: "start",
      label: "start",
      aliases: ["fra", "start tid"],
      type: "time",
      required: true,
      example: "08:00",
    },
    {
      key: "end",
      label: "slut",
      aliases: ["til", "slut tid", "end"],
      type: "time",
      required: true,
      example: "16:00",
    },
    {
      key: "break_minutes",
      label: "pause (min)",
      aliases: ["pause", "pauseminutter", "pause minutter"],
      type: "minutes",
      example: "30",
    },
    {
      key: "kind",
      label: "type",
      aliases: ["vagttype", "kind"],
      type: "shiftKind",
      example: "arbejde",
    },
    {
      key: "label",
      label: "betegnelse",
      aliases: ["label", "tekst"],
      type: "text",
      example: "Kasse",
    },
  ],
  balances: [
    {
      key: "employee_number",
      label: "medarbejdernummer",
      aliases: ["medarbejdernr", "nr", "employee number"],
      type: "text",
      required: true,
      example: "1002",
    },
    {
      key: "account",
      label: "saldo",
      aliases: ["konto", "fraværstype", "account"],
      type: "text",
      required: true,
      example: "Ferie",
    },
    {
      key: "hundredths",
      label: "dage",
      aliases: ["antal dage", "days"],
      type: "days",
      required: true,
      example: "12,5",
    },
    {
      key: "as_of",
      label: "pr. dato",
      aliases: ["dato", "as of"],
      type: "date",
      example: "01-12-2026",
    },
    {
      key: "note",
      label: "begrundelse",
      aliases: ["note", "årsag"],
      type: "note",
      required: true,
      example: "Saldo fra tidligere system",
    },
  ],
};

export function importFields(
  kind: ImportKind,
): readonly { key: string; label: string; required: boolean }[] {
  return FIELDS[kind].map((f) => ({ key: f.key, label: f.label, required: f.required ?? false }));
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------- values

type Value = string | number | null;
type Check = { ok: true; value: Value } | { ok: false; message: string };

/** dd-mm-yyyy, dd.mm.yyyy, d/m/yyyy or yyyy-mm-dd → ISO date. */
export function parseImportDate(s: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dk = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dk ? [dk[3], dk[2], dk[1]] : [];
  if (!y || !m || !d) return null;
  const out = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isValidIsoDate(out) ? out : null;
}

function check(type: FieldType, raw: string): Check {
  const s = raw.trim();
  switch (type) {
    case "text":
      return { ok: true, value: s };
    case "note":
      return s.length >= 5 ? { ok: true, value: s } : { ok: false, message: t.noteShort };
    case "date": {
      const d = parseImportDate(s);
      return d ? { ok: true, value: d } : { ok: false, message: t.badDate(s) };
    }
    case "time": {
      const m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { ok: false, message: t.badTime(s) };
      return { ok: true, value: `${m[1]!.padStart(2, "0")}:${m[2]}` };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
        ? { ok: true, value: s.toLowerCase() }
        : { ok: false, message: t.badEmail(s) };
    case "hours": {
      const n = parseDanishDecimal(s);
      if (n === null) return { ok: false, message: t.badNumber(s) };
      return n > 80
        ? { ok: false, message: t.hoursRange }
        : { ok: true, value: Math.round(n * 60) };
    }
    case "payForm": {
      const n = normalize(s);
      if (["timeloen", "time", "hourly"].includes(n)) return { ok: true, value: "hourly" };
      if (["maanedsloen", "maaned", "monthly"].includes(n)) return { ok: true, value: "monthly" };
      return { ok: false, message: t.badPayForm(s) };
    }
    case "minutes":
      return /^\d{1,3}$/.test(s) && Number(s) <= 600
        ? { ok: true, value: Number(s) }
        : { ok: false, message: t.badBreak(s) };
    case "shiftKind": {
      const n = normalize(s);
      if (["arbejde", "work", "vagt"].includes(n)) return { ok: true, value: "work" };
      if (["raadighed", "oncall"].includes(n)) return { ok: true, value: "on_call" };
      return { ok: false, message: t.badKind(s) };
    }
    case "days": {
      const h = parseDaysToHundredths(s);
      return h === null ? { ok: false, message: t.badDays(s) } : { ok: true, value: h };
    }
  }
}

/** A value for an empty cell: shifts default to work with no break; otherwise "not given". */
function emptyValue(f: Field): Value {
  if (f.type === "minutes") return 0;
  if (f.type === "shiftKind") return "work";
  return null;
}

// ---------------------------------------------------------------- reading

export type ImportProblem = { line: number; column?: string; message: string };
export type ImportRow = { line: number; values: Record<string, Value> };
export type ImportRead = {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** The file cannot be imported at all (a required column is missing, too many lines). */
  fatal: boolean;
  /** The keys of the columns found in the file. */
  columns: string[];
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Maps the columns, checks every cell and drops lines with problems (each problem names its line). */
export function readImport(kind: ImportKind, csv: ParsedCsv): ImportRead {
  const fields = FIELDS[kind];
  const problems: ImportProblem[] = [];
  if (csv.rows.length > MAX_IMPORT_LINES)
    return {
      rows: [],
      problems: [{ line: 1, message: t.tooMany(csv.rows.length, MAX_IMPORT_LINES) }],
      fatal: true,
      columns: [],
    };
  const byName = new Map<string, Field>();
  for (const f of fields)
    for (const n of [f.key, f.label, ...f.aliases]) byName.set(normalize(n), f);
  const columns: (Field | null)[] = csv.header.map((h) => byName.get(normalize(h)) ?? null);
  for (const f of fields)
    if (f.required && !columns.includes(f))
      problems.push({ line: 1, message: t.missingColumn(f.label) });
  const fatal = problems.length > 0;
  csv.header.forEach((h, i) => {
    if (!columns[i] && h) problems.push({ line: 1, message: t.unknownColumn(h) });
  });
  if (fatal) return { rows: [], problems, fatal, columns: [] };

  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (const r of csv.rows) {
    const values: Record<string, Value> = Object.fromEntries(
      fields.map((f) => [f.key, emptyValue(f)]),
    );
    const before = problems.length;
    columns.forEach((f, i) => {
      if (!f) return;
      const raw = (r.cells[i] ?? "").trim();
      const column = csv.header[i]!;
      if (raw === "") {
        if (f.required)
          problems.push({ line: r.line, column, message: t.required(capitalize(f.label)) });
        return;
      }
      const c = check(f.type, raw);
      if (c.ok) values[f.key] = c.value;
      else problems.push({ line: r.line, column, message: c.message });
    });
    // An employee is listed once per file.
    if (
      kind === "employees" &&
      problems.length === before &&
      typeof values.employee_number === "string"
    ) {
      const first = seen.get(values.employee_number);
      if (first)
        problems.push({
          line: r.line,
          column: csv.header[columns.findIndex((f) => f?.key === "employee_number")],
          message: t.duplicateEmployee(values.employee_number, first),
        });
      else seen.set(values.employee_number, r.line);
    }
    if (problems.length === before) rows.push({ line: r.line, values });
  }
  return {
    rows,
    problems,
    fatal: false,
    columns: [...new Set(columns.filter((f): f is Field => !!f).map((f) => f.key))],
  };
}

/** A file to fill in: the columns and an example line, for Danish spreadsheets. */
export function templateCsv(kind: ImportKind): string {
  const fields = FIELDS[kind];
  return toCsv(
    fields.map((f) => f.label),
    [fields.map((f) => f.example)],
  );
}
