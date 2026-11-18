/**
 * Posting (kontering) of time: dimensions such as Omkostningssted or Projekt
 * and their values. Pure helpers shared by the server and the browser.
 */
import { addDays, formatInstant, wallTime } from "@vagtplan/rules-engine";
import { localParts } from "./schedule-time";

const TZ = "Europe/Copenhagen";

/** dimension id → value id */
export type PostingValues = Record<string, string>;

/** A row on a shift or time entry (database shape). */
export type PostingAllocation = {
  values: PostingValues;
  start_at: string | null;
  end_at: string | null;
  minutes: number | null;
};

/** A row for the rules engine (`WorkIntervalInput.postings`). */
export type EnginePostingRow = {
  values: PostingValues;
  start: string | null;
  end: string | null;
  minutes: number | null;
};

export type PostingValue = { id: string; code: string; name: string; departmentIds: string[] };
export type PostingDimension = {
  id: string;
  key: string;
  name: string;
  required: boolean;
  values: PostingValue[];
};

/** A posting row as edited (local times, "" = not set). */
export type EditablePostingRow = {
  values: PostingValues;
  mode: "rest" | "span" | "minutes";
  from: string;
  to: string;
  minutes: number;
};

const isRest = (r: { start_at?: string | null; end_at?: string | null; minutes: number | null }) =>
  !(r.start_at && r.end_at) && r.minutes === null;

/**
 * The rows for the engine: each row on top of the defaults (department, then
 * employee). Time not covered by the rows keeps the defaults.
 */
export function resolvePostings(
  departmentDefaults: PostingValues,
  employeeDefaults: PostingValues,
  rows: readonly PostingAllocation[],
): EnginePostingRow[] {
  const base = { ...departmentDefaults, ...employeeDefaults };
  const hasBase = Object.keys(base).length > 0;
  const out: EnginePostingRow[] = rows.map((r) => ({
    values: { ...base, ...r.values },
    start: r.start_at && r.end_at ? r.start_at : null,
    end: r.start_at && r.end_at ? r.end_at : null,
    minutes: r.start_at && r.end_at ? null : r.minutes,
  }));
  if (hasBase && !rows.some(isRest))
    out.push({ values: base, start: null, end: null, minutes: null });
  return out;
}

/** Names of required dimensions without a value in some row (or with no rows at all). */
export function missingRequired(
  dimensions: readonly PostingDimension[],
  rows: readonly EnginePostingRow[],
): string[] {
  return dimensions
    .filter((d) => d.required)
    .filter((d) => rows.length === 0 || rows.some((r) => !r.values[d.id]))
    .map((d) => d.name);
}

/** Dimensions with only the values available in a department (dimensions without values are left out). */
export function availablePosting(
  dimensions: readonly PostingDimension[],
  departmentId: string | null,
): PostingDimension[] {
  return dimensions
    .map((d) => ({
      ...d,
      values: d.values.filter(
        (v) =>
          !departmentId || v.departmentIds.length === 0 || v.departmentIds.includes(departmentId),
      ),
    }))
    .filter((d) => d.values.length > 0);
}

/** "Omkostningssted 1100 · Projekt P-7" (dimension order). */
export function postingText(
  values: PostingValues,
  dimensions: readonly PostingDimension[],
): string {
  return dimensions
    .flatMap((d) => {
      const v = d.values.find((x) => x.id === values[d.id]);
      return v ? [`${d.name} ${v.code}`] : [];
    })
    .join(" · ");
}

/** A template's or rotation slot's default posting: one row for the whole shift. */
export function defaultPostingRows(values: PostingValues | null | undefined): EditablePostingRow[] {
  return values && Object.keys(values).length
    ? [{ values: { ...values }, mode: "rest", from: "", to: "", minutes: 60 }]
    : [];
}

export function postingToForm(rows: readonly PostingAllocation[]): EditablePostingRow[] {
  return rows.map((r) => ({
    values: { ...r.values },
    mode: r.start_at && r.end_at ? "span" : r.minutes !== null ? "minutes" : "rest",
    from: r.start_at ? localParts(r.start_at).time : "",
    to: r.end_at ? localParts(r.end_at).time : "",
    minutes: r.minutes ?? 60,
  }));
}

export function formPostingToDb(
  rows: readonly {
    values: PostingValues;
    mode: "rest" | "span" | "minutes";
    from: string | null;
    to: string | null;
    minutes: number | null;
    nextDayFrom: boolean;
    nextDayTo: boolean;
  }[],
  shiftDate: string,
): PostingAllocation[] {
  const at = (time: string, nextDay: boolean) =>
    formatInstant(wallTime(nextDay ? addDays(shiftDate, 1) : shiftDate, time, TZ));
  return rows.map((r) => ({
    values: r.values,
    start_at: r.mode === "span" && r.from ? at(r.from, r.nextDayFrom) : null,
    end_at: r.mode === "span" && r.to ? at(r.to, r.nextDayTo) : null,
    minutes: r.mode === "minutes" ? r.minutes : null,
  }));
}
