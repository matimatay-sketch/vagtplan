import { describe, expect, it } from "vitest";
import { breakTotals, dbBreaksToForm, formBreaksToDb, moveDbBreaks } from "./breaks";

describe("breaks conversion", () => {
  it("converts form breaks to instants, incl. after midnight", () => {
    expect(
      formBreaksToDb(
        [
          { start: "23:00", minutes: 15, paid: true, nextDay: false },
          { start: "02:00", minutes: 30, paid: false, nextDay: true },
          { start: null, minutes: 20, paid: false, nextDay: false },
        ],
        "2026-01-05",
      ),
    ).toEqual([
      { start_at: "2026-01-05T22:00:00Z", minutes: 15, paid: true },
      { start_at: "2026-01-06T01:00:00Z", minutes: 30, paid: false },
      { start_at: null, minutes: 20, paid: false },
    ]);
  });

  it("round-trips to form values in local time", () => {
    expect(
      dbBreaksToForm([
        { start_at: "2026-07-06T10:00:00Z", minutes: 30, paid: true },
        { start_at: null, minutes: 15, paid: false },
      ]),
    ).toEqual([
      { start: "12:00", minutes: 30, paid: true },
      { start: "", minutes: 15, paid: false },
    ]);
  });

  it("moving a shift keeps placed breaks at the same wall-clock time, across DST", () => {
    // Friday 27 March 2026 12:00 (CET) → Monday 30 March 2026 12:00 (CEST)
    expect(
      moveDbBreaks(
        [{ start_at: "2026-03-27T11:00:00Z", minutes: 30, paid: false }],
        "2026-03-27",
        "2026-03-30",
      ),
    ).toEqual([{ start_at: "2026-03-30T10:00:00Z", minutes: 30, paid: false }]);
  });

  it("sums paid and unpaid minutes", () => {
    expect(
      breakTotals([
        { start_at: null, minutes: 30, paid: false },
        { start_at: null, minutes: 15, paid: true },
      ]),
    ).toEqual({ paid: 15, unpaid: 30 });
  });
});

describe("moving allocations", () => {
  it("moves spans with the shift at the same wall-clock time", async () => {
    const { moveAllocations } = await import("./breaks");
    expect(
      moveAllocations(
        [
          {
            project_id: "P",
            start_at: "2026-03-27T07:00:00Z",
            end_at: "2026-03-27T11:00:00Z",
            minutes: null,
          },
        ],
        "2026-03-27",
        "2026-03-30",
      ),
    ).toEqual([
      {
        project_id: "P",
        start_at: "2026-03-30T06:00:00Z",
        end_at: "2026-03-30T10:00:00Z",
        minutes: null,
      },
    ]);
  });
});
