import { describe, expect, it } from "vitest";
import {
  countFlags,
  filterTimeRows,
  parseTimeFilters,
  type FilterContext,
  type FilterableRow,
} from "./time-filters";

const row = (over: Partial<FilterableRow>): FilterableRow => ({
  kind: "entry",
  entryId: "e1",
  employeeId: "mads",
  employeeName: "Mads Medarbejder",
  employeeNumber: "1002",
  status: "pending",
  source: "stamp",
  version: 1,
  offline: false,
  deviationReason: null,
  start: "2026-11-02T07:00:00Z",
  end: "2026-11-02T15:00:00Z",
  plan: { start: "2026-11-02T07:00:00Z", end: "2026-11-02T15:00:00Z" },
  violations: [],
  postingAllocations: [],
  supplementTypeIds: [],
  ...over,
});
const ctx: FilterContext = {
  payCodesByEntry: { e1: ["NORMAL"], e2: ["NORMAL", "AFTEN"] },
  absenceTypesByEmployee: { ida: ["sick"] },
  myEmployees: ["ida"],
};
const ids = (rows: FilterableRow[]) => rows.map((r) => r.entryId ?? `missing:${r.employeeId}`);

describe("parseTimeFilters", () => {
  it("reads search params and ignores unknown values", () => {
    expect(
      parseTimeFilters({
        status: "open",
        vis: ["warnings", "bogus"],
        loenart: "AFTEN",
        fravaer: "sick",
        q: " ida ",
      }),
    ).toEqual({
      status: "open",
      flags: ["warnings"],
      payCode: "AFTEN",
      absenceType: "sick",
      postingValue: null,
      query: "ida",
    });
    expect(parseTimeFilters({ status: "nope", vis: "corrected" }).status).toBe("all");
    expect(parseTimeFilters({ vis: "corrected" }).flags).toEqual(["corrected"]);
  });
});

describe("filterTimeRows", () => {
  const rows = [
    row({}),
    row({
      entryId: "e2",
      status: "approved",
      end: "2026-11-02T16:30:00Z",
      deviationReason: "Varer",
    }),
    row({ entryId: "e3", status: "open", end: null, source: "stamp" }),
    row({
      entryId: "e4",
      employeeId: "ida",
      employeeName: "Ida Ung",
      employeeNumber: "1004",
      version: 2,
      source: "manual",
      offline: true,
      violations: [{ severity: "WARNING" }],
    }),
    row({
      kind: "missing",
      entryId: null,
      employeeId: "ida",
      employeeName: "Ida Ung",
      employeeNumber: "1004",
      status: null,
    }),
    row({
      entryId: "e5",
      postingAllocations: [{ values: { cc: "v1200" } }],
      supplementTypeIds: ["s1"],
    }),
  ];
  const f = (p: Record<string, string | string[]>) =>
    ids(filterTimeRows(rows, parseTimeFilters(p), ctx));

  it("status: not approved, approved, not stamped out, not registered", () => {
    expect(f({ status: "pending" })).toEqual(["e1", "e4", "e5"]);
    expect(f({ status: "approved" })).toEqual(["e2"]);
    expect(f({ status: "open" })).toEqual(["e3"]);
    expect(f({ status: "missing" })).toEqual(["missing:ida"]);
    expect(f({})).toEqual(["e1", "e2", "e3", "e4", "missing:ida", "e5"]);
  });

  it("flags combine with AND", () => {
    expect(f({ vis: "warnings" })).toEqual(["e4"]);
    expect(f({ vis: "deviation" })).toEqual(["e2"]);
    expect(f({ vis: "corrected" })).toEqual(["e4"]);
    expect(f({ vis: ["offline", "manual"] })).toEqual(["e4"]);
    expect(f({ vis: "supplements" })).toEqual(["e5"]);
    expect(f({ vis: "posting" })).toEqual(["e5"]);
    expect(f({ vis: "mine" })).toEqual(["e4", "missing:ida"]);
  });

  it("pay code, absence type, posting value and free text", () => {
    expect(f({ loenart: "AFTEN" })).toEqual(["e2"]);
    expect(f({ fravaer: "sick" })).toEqual(["e4", "missing:ida"]);
    expect(f({ kontering: "v1200" })).toEqual(["e5"]);
    expect(f({ q: "ida" })).toEqual(["e4", "missing:ida"]);
    expect(f({ q: "1002" })).toEqual(["e1", "e2", "e3", "e5"]);
  });

  it("counts rows per flag for the filter chips", () => {
    expect(countFlags(rows, ctx)).toMatchObject({
      warnings: 1,
      deviation: 1,
      corrected: 1,
      offline: 1,
      manual: 1,
      supplements: 1,
      posting: 1,
      mine: 2,
    });
  });
});
