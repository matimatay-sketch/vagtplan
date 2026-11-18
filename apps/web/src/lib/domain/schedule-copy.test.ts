import { describe, expect, it } from "vitest";
import { copyDates, weekTargets } from "./schedule-copy";

describe("copyDates", () => {
  it("chosen days of the week, repeated for the following weeks, without the shift's own day", () => {
    // The shift is on Monday 2027-03-01; copy to Wednesday and Friday, this week and 1 more.
    expect(copyDates("2027-03-01", ["2027-03-03", "2027-03-05"], 2)).toEqual([
      "2027-03-03",
      "2027-03-05",
      "2027-03-08",
      "2027-03-10",
      "2027-03-12",
    ]);
  });
  it("only the same day in the next weeks when no days are chosen", () => {
    expect(copyDates("2027-03-01", [], 3)).toEqual(["2027-03-08", "2027-03-15"]);
  });
  it("one week means only the chosen days; duplicates are removed", () => {
    expect(copyDates("2027-03-01", ["2027-03-01", "2027-03-02", "2027-03-02"], 1)).toEqual([
      "2027-03-02",
    ]);
  });
});

describe("weekTargets", () => {
  it("next week, the next N weeks, or a chosen week (any day of it)", () => {
    expect(weekTargets("2027-03-01", { kind: "next", weeks: 1 })).toEqual(["2027-03-08"]);
    expect(weekTargets("2027-03-01", { kind: "next", weeks: 3 })).toEqual([
      "2027-03-08",
      "2027-03-15",
      "2027-03-22",
    ]);
    expect(weekTargets("2027-03-01", { kind: "week", date: "2027-04-07" })).toEqual(["2027-04-05"]);
    expect(weekTargets("2027-03-01", { kind: "week", date: "2027-03-03" })).toEqual([]);
  });
});
