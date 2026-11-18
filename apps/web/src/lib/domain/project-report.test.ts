import { describe, expect, it } from "vitest";
import {
  decimalHours,
  projectLines,
  summarizeProjects,
  type ProjectShiftRow,
} from "./project-report";

const row = (over: Partial<ProjectShiftRow>): ProjectShiftRow => ({
  id: "s1",
  department_id: "d1",
  department_name: "Butik",
  employee_id: "e1",
  employee_number: "1001",
  employee_name: "Mia Hansen",
  // 08:00–16:00 Copenhagen winter time, 30 min unpaid break.
  start_at: "2027-01-04T07:00:00Z",
  end_at: "2027-01-04T15:00:00Z",
  breaks: [{ start_at: null, minutes: 30, paid: false }],
  posting_allocations: [{ values: { proj: "p1" }, start_at: null, end_at: null, minutes: null }],
  status: "draft",
  kind: "work",
  ...over,
});

describe("projectLines", () => {
  it("one line per project and shift, dated in local time, without the unallocated rest", () => {
    const lines = projectLines("proj", [
      row({
        posting_allocations: [
          { values: { proj: "p1" }, start_at: null, end_at: null, minutes: 120 },
          { values: { proj: "p2" }, start_at: null, end_at: null, minutes: 60 },
        ],
      }),
      // 23:30 local on 3 January is still 3 January.
      row({
        id: "s2",
        start_at: "2027-01-03T22:30:00Z",
        end_at: "2027-01-04T02:30:00Z",
        breaks: [],
      }),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ shiftId: "s1", projectId: "p1", minutes: 120, date: "2027-01-04" }),
      expect.objectContaining({ shiftId: "s1", projectId: "p2", minutes: 60, date: "2027-01-04" }),
      expect.objectContaining({ shiftId: "s2", projectId: "p1", minutes: 240, date: "2027-01-03" }),
    ]);
  });
  it("an open shift has no employee", () => {
    const [l] = projectLines("proj", [
      row({ employee_id: null, employee_number: null, employee_name: null }),
    ]);
    expect(l).toMatchObject({ employeeId: null, minutes: 450 });
  });
});

describe("projectLines with other dimensions", () => {
  it("rows without a project use time but give no line; other dimensions are ignored", () => {
    const lines = projectLines("proj", [
      row({
        posting_allocations: [
          { values: { cc: "1100" }, start_at: null, end_at: null, minutes: 120 },
          { values: { cc: "1200", proj: "p1" }, start_at: null, end_at: null, minutes: null },
        ],
      }),
    ]);
    expect(lines.map((l) => [l.projectId, l.minutes])).toEqual([["p1", 330]]);
  });
});

describe("summarizeProjects", () => {
  it("totals per project and per employee, counting shifts once", () => {
    const lines = projectLines("proj", [
      row({}),
      row({ id: "s2", employee_id: "e2", employee_name: "Ole", employee_number: "1002" }),
      row({
        id: "s3",
        posting_allocations: [
          { values: { proj: "p1" }, start_at: null, end_at: null, minutes: 60 },
          { values: { proj: "p1" }, start_at: null, end_at: null, minutes: 30 },
          { values: { proj: "p2" }, start_at: null, end_at: null, minutes: null },
        ],
      }),
    ]);
    expect(summarizeProjects(lines)).toEqual([
      {
        projectId: "p1",
        minutes: 450 + 450 + 90,
        shiftCount: 3,
        employees: [
          { employeeId: "e1", name: "Mia Hansen", minutes: 540 },
          { employeeId: "e2", name: "Ole", minutes: 450 },
        ],
      },
      {
        projectId: "p2",
        minutes: 360,
        shiftCount: 1,
        employees: [{ employeeId: "e1", name: "Mia Hansen", minutes: 360 }],
      },
    ]);
  });
});

describe("decimalHours", () => {
  it("formats minutes as Danish decimal hours with two decimals, without floats", () => {
    expect(decimalHours(0)).toBe("0,00");
    expect(decimalHours(450)).toBe("7,50");
    expect(decimalHours(20)).toBe("0,33");
    expect(decimalHours(50)).toBe("0,83");
    expect(decimalHours(59)).toBe("0,98");
    expect(decimalHours(1439)).toBe("23,98");
  });
});
