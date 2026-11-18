import { describe, expect, it } from "vitest";
import {
  formPostingToDb,
  missingRequired,
  postingText,
  postingToForm,
  resolvePostings,
  type PostingDimension,
} from "./posting";

const CC = "d0000000-0000-0000-0000-0000000000cc";
const PRJ = "d0000000-0000-0000-0000-0000000000aa";
const dims: PostingDimension[] = [
  {
    id: CC,
    key: "omkostningssted",
    name: "Omkostningssted",
    required: true,
    values: [
      { id: "v1100", code: "1100", name: "Butik", departmentIds: [] },
      { id: "v1200", code: "1200", name: "Lager", departmentIds: ["dep-lager"] },
    ],
  },
  {
    id: PRJ,
    key: "projekt",
    name: "Projekt",
    required: false,
    values: [{ id: "p7", code: "P-7", name: "Ombygning", departmentIds: [] }],
  },
];

describe("resolvePostings: the most specific value wins per dimension", () => {
  it("no rows and no defaults: no posting", () => {
    expect(resolvePostings({}, {}, [])).toEqual([]);
  });

  it("no rows: the defaults for the whole shift (employee over department)", () => {
    expect(resolvePostings({ [CC]: "v1100", [PRJ]: "p7" }, { [CC]: "v1200" }, [])).toEqual([
      { values: { [CC]: "v1200", [PRJ]: "p7" }, start: null, end: null, minutes: null },
    ]);
  });

  it("a row overrides the defaults; time not covered by rows keeps the defaults", () => {
    const rows = [
      {
        values: { [PRJ]: "p7" },
        start_at: "2026-01-06T13:00:00Z",
        end_at: "2026-01-06T15:00:00Z",
        minutes: null,
      },
    ];
    expect(resolvePostings({ [CC]: "v1100" }, {}, rows)).toEqual([
      {
        values: { [CC]: "v1100", [PRJ]: "p7" },
        start: "2026-01-06T13:00:00Z",
        end: "2026-01-06T15:00:00Z",
        minutes: null,
      },
      { values: { [CC]: "v1100" }, start: null, end: null, minutes: null },
    ]);
  });

  it("with its own rest row, no default rest row is added", () => {
    const rows = [{ values: { [CC]: "v1200" }, start_at: null, end_at: null, minutes: null }];
    expect(resolvePostings({ [CC]: "v1100" }, {}, rows)).toEqual([
      { values: { [CC]: "v1200" }, start: null, end: null, minutes: null },
    ]);
  });
});

describe("required dimensions", () => {
  it("reports required dimensions missing in any row, and time without any row", () => {
    expect(missingRequired(dims, [])).toEqual(["Omkostningssted"]);
    expect(
      missingRequired(dims, [{ values: { [PRJ]: "p7" }, start: null, end: null, minutes: null }]),
    ).toEqual(["Omkostningssted"]);
    expect(
      missingRequired(dims, [{ values: { [CC]: "v1100" }, start: null, end: null, minutes: null }]),
    ).toEqual([]);
  });
});

describe("form conversion and text", () => {
  it("round-trips local span times, also after midnight", () => {
    const db = formPostingToDb(
      [
        {
          values: { [CC]: "v1100" },
          mode: "span",
          from: "22:00",
          to: "02:00",
          minutes: null,
          nextDayFrom: false,
          nextDayTo: true,
        },
      ],
      "2026-01-06",
    );
    expect(db).toEqual([
      {
        values: { [CC]: "v1100" },
        start_at: "2026-01-06T21:00:00Z",
        end_at: "2026-01-07T01:00:00Z",
        minutes: null,
      },
    ]);
    expect(postingToForm(db)).toEqual([
      { values: { [CC]: "v1100" }, mode: "span", from: "22:00", to: "02:00", minutes: 60 },
    ]);
  });

  it("describes a posting with codes in dimension order", () => {
    expect(postingText({ [PRJ]: "p7", [CC]: "v1100" }, dims)).toBe(
      "Omkostningssted 1100 · Projekt P-7",
    );
    expect(postingText({}, dims)).toBe("");
  });
});
