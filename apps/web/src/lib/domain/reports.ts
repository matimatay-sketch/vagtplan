/**
 * General reports (Rapporter): employee data, registered time, absence,
 * planned shifts and norm hours. Pure: the page loads the rows (RLS limits
 * what the user sees) and builds tables and CSV here.
 */
import { addDays, diffDays, isValidIsoDate, type IsoDate } from "./civil-date";
import { da } from "@/lib/i18n/da";

export const REPORTS = ["employees", "time", "absence", "shifts", "norm"] as const;
export type ReportKind = (typeof REPORTS)[number];

export type ReportColumn = { key: string; label: string; numeric?: boolean };
export type ReportTable = { columns: ReportColumn[]; rows: Record<string, string>[] };

/** The longest range a report covers. */
export const MAX_REPORT_DAYS = 366;

const one = (v: unknown): string =>
  Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";

export function parseReportQuery(
  sp: Record<string, string | string[] | undefined>,
  today: IsoDate,
): { report: ReportKind; from: IsoDate; to: IsoDate; departmentId: string | null } {
  const r = one(sp.rapport);
  const report = (REPORTS as readonly string[]).includes(r) ? (r as ReportKind) : "employees";
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1);
  let from = isValidIsoDate(one(sp.fra)) ? one(sp.fra) : monthStart;
  let to = isValidIsoDate(one(sp.til)) ? one(sp.til) : monthEnd;
  if (to < from) [from, to] = [to, from];
  if (diffDays(to, from) >= MAX_REPORT_DAYS) to = addDays(from, MAX_REPORT_DAYS - 1);
  return { report, from, to, departmentId: one(sp.afdeling) || null };
}

/** Minutes as Danish hours with two decimals: 450 → "7,50". */
export function hoursText(minutes: number): string {
  const hundredths = Math.round((Math.abs(minutes) * 100) / 60);
  const sign = minutes < 0 && hundredths > 0 ? "-" : "";
  return `${sign}${Math.floor(hundredths / 100)},${String(hundredths % 100).padStart(2, "0")}`;
}

/** "2026-11-18" → "18.11.2026". */
export const dateText = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";

/**
 * Norm minutes in a range: 1/7 of the weekly norm for each calendar day a
 * contract runs (as the rules engine counts a weekly norm), rounded once.
 */
export function normMinutes(
  contracts: readonly { from: IsoDate; to: IsoDate | null; weeklyMinutes: number }[],
  range: { from: IsoDate; to: IsoDate },
): number {
  let total = 0;
  for (const c of contracts) {
    const from = c.from > range.from ? c.from : range.from;
    const to = c.to !== null && c.to < range.to ? c.to : range.to;
    if (to < from) continue;
    total += ((diffDays(to, from) + 1) * c.weeklyMinutes) / 7;
  }
  return Math.round(total);
}

function quote(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** Semicolon-separated with BOM and CRLF, so Excel opens it with Danish characters. */
export function toCsv(t: ReportTable): string {
  const lines = [
    t.columns.map((c) => quote(c.label)).join(";"),
    ...t.rows.map((r) => t.columns.map((c) => quote(r[c.key] ?? "")).join(";")),
  ];
  return "﻿" + lines.map((l) => `${l}\r\n`).join("");
}

const col = da.reports.columns;

export function employeesReport(
  rows: readonly {
    number: string;
    name: string;
    email: string | null;
    phone: string | null;
    birthDate: string;
    hiredOn: string | null;
    terminatedOn: string | null;
    departments: string[];
    agreement: string | null;
    payForm: "hourly" | "monthly" | null;
    weeklyMinutes: number | null;
    staffGroup: string | null;
  }[],
): ReportTable {
  return {
    columns: [
      { key: "number", label: col.number },
      { key: "name", label: col.name },
      { key: "email", label: col.email },
      { key: "phone", label: col.phone },
      { key: "birthDate", label: col.birthDate },
      { key: "hiredOn", label: col.hiredOn },
      { key: "terminatedOn", label: col.terminatedOn },
      { key: "departments", label: col.departments },
      { key: "agreement", label: col.agreement },
      { key: "payForm", label: col.payForm },
      { key: "weekly", label: col.weekly, numeric: true },
      { key: "staffGroup", label: col.staffGroup },
    ],
    rows: rows.map((r) => ({
      number: r.number,
      name: r.name,
      email: r.email ?? "",
      phone: r.phone ?? "",
      birthDate: dateText(r.birthDate),
      hiredOn: dateText(r.hiredOn),
      terminatedOn: dateText(r.terminatedOn),
      departments: r.departments.join(", "),
      agreement: r.agreement ?? "",
      payForm: r.payForm ? da.reports.payForms[r.payForm] : "",
      weekly: r.weeklyMinutes === null ? "" : hoursText(r.weeklyMinutes),
      staffGroup: r.staffGroup ?? "",
    })),
  };
}

export function timeReport(
  rows: readonly {
    date: string;
    number: string;
    name: string;
    department: string;
    start: string;
    end: string | null;
    breakMinutes: number;
    workedMinutes: number | null;
    status: string;
    source: string;
  }[],
): ReportTable {
  return {
    columns: [
      { key: "date", label: col.date },
      { key: "number", label: col.number },
      { key: "name", label: col.name },
      { key: "department", label: col.department },
      { key: "start", label: col.start },
      { key: "end", label: col.end },
      { key: "breaks", label: col.unpaidBreaks, numeric: true },
      { key: "worked", label: col.worked, numeric: true },
      { key: "status", label: col.status },
      { key: "source", label: col.source },
    ],
    rows: rows.map((r) => ({
      date: dateText(r.date),
      number: r.number,
      name: r.name,
      department: r.department,
      start: r.start,
      end: r.end ?? "",
      breaks: hoursText(r.breakMinutes),
      worked: r.workedMinutes === null ? "" : hoursText(r.workedMinutes),
      status: r.status,
      source: r.source,
    })),
  };
}

export function absenceReport(
  rows: readonly {
    number: string;
    name: string;
    type: string;
    from: string;
    to: string;
    status: string;
    daysHundredths: number | null;
  }[],
): ReportTable {
  return {
    columns: [
      { key: "number", label: col.number },
      { key: "name", label: col.name },
      { key: "type", label: col.absenceType },
      { key: "from", label: col.from },
      { key: "to", label: col.to },
      { key: "status", label: col.status },
      { key: "days", label: col.days, numeric: true },
    ],
    rows: rows.map((r) => ({
      number: r.number,
      name: r.name,
      type: r.type,
      from: dateText(r.from),
      to: dateText(r.to),
      status: r.status,
      days:
        r.daysHundredths === null
          ? ""
          : `${Math.floor(r.daysHundredths / 100)},${String(r.daysHundredths % 100).padStart(2, "0")}`,
    })),
  };
}

export function shiftsReport(
  rows: readonly {
    date: string;
    number: string;
    name: string;
    department: string;
    start: string;
    end: string;
    minutes: number;
    kind: string;
    status: string;
  }[],
): ReportTable {
  return {
    columns: [
      { key: "date", label: col.date },
      { key: "number", label: col.number },
      { key: "name", label: col.name },
      { key: "department", label: col.department },
      { key: "start", label: col.start },
      { key: "end", label: col.end },
      { key: "hours", label: col.plannedHours, numeric: true },
      { key: "kind", label: col.kind },
      { key: "status", label: col.status },
    ],
    rows: rows.map((r) => ({
      date: dateText(r.date),
      number: r.number,
      name: r.name,
      department: r.department,
      start: r.start,
      end: r.end,
      hours: hoursText(r.minutes),
      kind: r.kind,
      status: r.status,
    })),
  };
}

export function normReport(
  rows: readonly {
    number: string;
    name: string;
    weeklyMinutes: number | null;
    normMinutes: number;
    plannedMinutes: number;
    registeredMinutes: number;
  }[],
): ReportTable {
  return {
    columns: [
      { key: "number", label: col.number },
      { key: "name", label: col.name },
      { key: "weekly", label: col.weekly, numeric: true },
      { key: "norm", label: col.norm, numeric: true },
      { key: "planned", label: col.plannedHours, numeric: true },
      { key: "registered", label: col.registered, numeric: true },
      { key: "difference", label: col.difference, numeric: true },
    ],
    rows: rows.map((r) => ({
      number: r.number,
      name: r.name,
      weekly: r.weeklyMinutes === null ? "" : hoursText(r.weeklyMinutes),
      norm: hoursText(r.normMinutes),
      planned: hoursText(r.plannedMinutes),
      registered: hoursText(r.registeredMinutes),
      difference: hoursText(r.registeredMinutes - r.normMinutes),
    })),
  };
}
