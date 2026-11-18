/**
 * Filters for the approval page (Godkend tid). Pure: the page loads rows,
 * pay codes per registration and absence per employee, then filters here.
 */

export const STATUS_FILTERS = ["all", "pending", "approved", "open", "missing"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const FLAG_FILTERS = [
  "warnings",
  "deviation",
  "corrected",
  "manual",
  "offline",
  "supplements",
  "posting",
  "mine",
] as const;
export type FlagFilter = (typeof FLAG_FILTERS)[number];

export type TimeFilters = {
  status: StatusFilter;
  flags: FlagFilter[];
  payCode: string | null;
  absenceType: string | null;
  postingValue: string | null;
  query: string;
};

/** The fields of a time row the filters look at. */
export type FilterableRow = {
  kind: "entry" | "missing";
  entryId: string | null;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  status: "open" | "pending" | "approved" | null;
  source: "stamp" | "planned" | "manual" | null;
  version: number;
  offline: boolean;
  deviationReason: string | null;
  start: string;
  end: string | null;
  plan: { start: string; end: string } | null;
  violations: readonly unknown[];
  postingAllocations: readonly { values: Record<string, string> }[];
  /** Supplements the employee added (optional until loaded). */
  supplementTypeIds?: readonly string[];
};

export type FilterContext = {
  /** entry id → pay codes the registration activates */
  payCodesByEntry: Record<string, string[]>;
  /** employee id → absence types in the period */
  absenceTypesByEmployee: Record<string, string[]>;
  /** Employees the user approves personally ("Godkendes af"). */
  myEmployees: readonly string[];
};

const one = (v: unknown): string =>
  Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";
const many = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];

export function parseTimeFilters(sp: Record<string, string | string[] | undefined>): TimeFilters {
  const status = one(sp.status);
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as StatusFilter)
      : "all",
    flags: many(sp.vis).filter((f): f is FlagFilter =>
      (FLAG_FILTERS as readonly string[]).includes(f),
    ),
    payCode: one(sp.loenart) || null,
    absenceType: one(sp.fravaer) || null,
    postingValue: one(sp.kontering) || null,
    query: one(sp.q).trim(),
  };
}

function hasFlag(r: FilterableRow, flag: FlagFilter, ctx: FilterContext): boolean {
  switch (flag) {
    case "warnings":
      return r.violations.length > 0;
    case "deviation":
      return (
        r.kind === "entry" &&
        (Boolean(r.deviationReason) ||
          (r.plan !== null && r.end !== null && (r.start !== r.plan.start || r.end !== r.plan.end)))
      );
    case "corrected":
      return r.version > 1;
    case "manual":
      return r.source === "manual";
    case "offline":
      return r.offline;
    case "supplements":
      return (r.supplementTypeIds?.length ?? 0) > 0;
    case "posting":
      return r.postingAllocations.length > 0;
    case "mine":
      return ctx.myEmployees.includes(r.employeeId);
  }
}

function statusMatches(r: FilterableRow, s: StatusFilter): boolean {
  if (s === "all") return true;
  if (s === "missing") return r.kind === "missing";
  return r.kind === "entry" && r.status === s;
}

export function filterTimeRows<R extends FilterableRow>(
  rows: readonly R[],
  f: TimeFilters,
  ctx: FilterContext,
): R[] {
  const q = f.query.toLowerCase();
  return rows.filter(
    (r) =>
      statusMatches(r, f.status) &&
      f.flags.every((flag) => hasFlag(r, flag, ctx)) &&
      (!f.payCode ||
        (r.entryId !== null && (ctx.payCodesByEntry[r.entryId] ?? []).includes(f.payCode))) &&
      (!f.absenceType ||
        (ctx.absenceTypesByEmployee[r.employeeId] ?? []).includes(f.absenceType)) &&
      (!f.postingValue ||
        r.postingAllocations.some((a) => Object.values(a.values).includes(f.postingValue!))) &&
      (!q ||
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeNumber.toLowerCase().includes(q)),
  );
}

/** Rows per flag (before filtering by flags), for the filter chips. */
export function countFlags(
  rows: readonly FilterableRow[],
  ctx: FilterContext,
): Record<FlagFilter, number> {
  return Object.fromEntries(
    FLAG_FILTERS.map((flag) => [flag, rows.filter((r) => hasFlag(r, flag, ctx)).length]),
  ) as Record<FlagFilter, number>;
}
