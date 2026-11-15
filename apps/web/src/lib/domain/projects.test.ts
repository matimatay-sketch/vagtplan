import { describe, expect, it } from "vitest";
import {
  allocationsToForm,
  defaultProjectRows,
  projectMinutes,
  type ProjectAllocation,
} from "./projects";

// 08:00–16:00 local on 5 Jan 2026 = 07:00–15:00Z
const shift = {
  start: "2026-01-05T07:00:00Z",
  end: "2026-01-05T15:00:00Z",
  breaks: [{ start_at: null, minutes: 30, paid: false }],
};

describe("projectMinutes", () => {
  it("one project without time gets all paid minutes", () => {
    expect(
      projectMinutes(shift, [{ project_id: "A", start_at: null, end_at: null, minutes: null }]),
    ).toEqual([{ projectId: "A", minutes: 450 }]);
  });

  it("time spans count real minutes minus unpaid placed breaks inside them; the rest goes to the remainder", () => {
    const allocations: ProjectAllocation[] = [
      {
        project_id: "A",
        start_at: "2026-01-05T07:00:00Z",
        end_at: "2026-01-05T11:00:00Z",
        minutes: null,
      },
      { project_id: "B", start_at: null, end_at: null, minutes: null },
    ];
    const withPlacedBreak = {
      ...shift,
      breaks: [{ start_at: "2026-01-05T10:00:00Z", minutes: 30, paid: false }],
    };
    expect(projectMinutes(withPlacedBreak, allocations)).toEqual([
      { projectId: "A", minutes: 210 },
      { projectId: "B", minutes: 240 },
    ]);
  });

  it("fixed minutes; unallocated time is reported without project", () => {
    expect(
      projectMinutes(shift, [
        { project_id: "A", start_at: null, end_at: null, minutes: 120 },
        { project_id: "B", start_at: null, end_at: null, minutes: 60 },
      ]),
    ).toEqual([
      { projectId: "A", minutes: 120 },
      { projectId: "B", minutes: 60 },
      { projectId: null, minutes: 270 },
    ]);
  });

  it("no allocations → everything without project", () => {
    expect(projectMinutes(shift, [])).toEqual([{ projectId: null, minutes: 450 }]);
  });

  it("the same project in two rows is summed; paid breaks are not deducted", () => {
    const paid = { ...shift, breaks: [{ start_at: null, minutes: 15, paid: true }] };
    expect(
      projectMinutes(paid, [
        { project_id: "A", start_at: null, end_at: null, minutes: 60 },
        { project_id: "A", start_at: null, end_at: null, minutes: null },
      ]),
    ).toEqual([{ projectId: "A", minutes: 480 }]);
  });
});

describe("allocationProblems", () => {
  it("accepts valid allocations and reports problems", async () => {
    const { allocationProblems } = await import("./projects");
    expect(
      allocationProblems(shift, [{ project_id: "A", start_at: null, end_at: null, minutes: null }]),
    ).toEqual([]);
    expect(
      allocationProblems(shift, [
        {
          project_id: "A",
          start_at: "2026-01-05T06:00:00Z",
          end_at: "2026-01-05T08:00:00Z",
          minutes: null,
        },
      ]),
    ).toEqual(["outside"]);
    expect(
      allocationProblems(shift, [
        {
          project_id: "A",
          start_at: "2026-01-05T07:00:00Z",
          end_at: "2026-01-05T09:00:00Z",
          minutes: null,
        },
        {
          project_id: "B",
          start_at: "2026-01-05T08:00:00Z",
          end_at: "2026-01-05T10:00:00Z",
          minutes: null,
        },
      ]),
    ).toEqual(["overlap"]);
    expect(
      allocationProblems(shift, [
        { project_id: "A", start_at: null, end_at: null, minutes: null },
        { project_id: "B", start_at: null, end_at: null, minutes: null },
      ]),
    ).toEqual(["two_remainders"]);
    expect(
      allocationProblems(shift, [{ project_id: "A", start_at: null, end_at: null, minutes: 500 }]),
    ).toEqual(["too_many_minutes"]);
  });
});

describe("allocationsToForm", () => {
  it("maps spans, minutes and rest rows to local times", () => {
    expect(
      allocationsToForm([
        {
          project_id: "a",
          start_at: "2026-03-29T06:00:00.000Z",
          end_at: "2026-03-29T08:30:00.000Z",
          minutes: null,
        },
        { project_id: "b", start_at: null, end_at: null, minutes: 45 },
        { project_id: "c", start_at: null, end_at: null, minutes: null },
      ]),
    ).toEqual([
      // 29 March 2026 is the first day of summer time (UTC+2).
      { project_id: "a", mode: "span", from: "08:00", to: "10:30", minutes: 60 },
      { project_id: "b", mode: "minutes", from: "", to: "", minutes: 45 },
      { project_id: "c", mode: "rest", from: "", to: "", minutes: 60 },
    ]);
  });
  it("a default project covers the whole shift", () => {
    expect(defaultProjectRows(null)).toEqual([]);
    expect(defaultProjectRows("p")).toEqual([
      { project_id: "p", mode: "rest", from: "", to: "", minutes: 60 },
    ]);
  });
});
