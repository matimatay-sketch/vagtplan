import { describe, expect, it } from "vitest";
import { Pseudonyms } from "./pseudonyms";
import { checkProposal, type ProposedShift } from "./proposal";

const p = new Pseudonyms();
const MADS = p.code("employee", "mads", "Mads Medarbejder");
const IDA = p.code("employee", "ida", "Ida Ung");
const week = [
  "2027-03-01",
  "2027-03-02",
  "2027-03-03",
  "2027-03-04",
  "2027-03-05",
  "2027-03-06",
  "2027-03-07",
];
const s = (over: Partial<ProposedShift>): ProposedShift => ({
  employee: MADS,
  date: "2027-03-01",
  start: "08:00",
  end: "16:00",
  unpaid_break_minutes: 30,
  label: null,
  ...over,
});
const check = (
  shifts: ProposedShift[],
  existing: Parameters<typeof checkProposal>[1]["existing"] = [],
) =>
  checkProposal(shifts, { pseudonyms: p, weekDates: week, employeeIds: ["mads", "ida"], existing });

describe("checkProposal", () => {
  it("maps codes back to employees and keeps valid shifts", () => {
    const r = check([
      s({}),
      s({ employee: null, date: "2027-03-02" }),
      s({ employee: IDA, start: "22:00", end: "02:00", unpaid_break_minutes: 0 }),
    ]);
    expect(r.problems).toEqual([]);
    expect(r.shifts).toEqual([
      {
        employeeId: "mads",
        date: "2027-03-01",
        start: "08:00",
        end: "16:00",
        endsNextDay: false,
        breakMinutes: 30,
        label: null,
      },
      {
        employeeId: null,
        date: "2027-03-02",
        start: "08:00",
        end: "16:00",
        endsNextDay: false,
        breakMinutes: 30,
        label: null,
      },
      {
        employeeId: "ida",
        date: "2027-03-01",
        start: "22:00",
        end: "02:00",
        endsNextDay: true,
        breakMinutes: 0,
        label: null,
      },
    ]);
  });

  it("drops shifts with unknown people, dates outside the week, bad times or too long breaks", () => {
    const r = check([
      s({ employee: "MEDARBEJDER_99" }),
      s({ date: "2027-03-08" }),
      s({ start: "8", end: "16:00" }),
      s({ start: "08:00", end: "08:00" }),
      s({ start: "08:00", end: "09:00", unpaid_break_minutes: 60 }),
    ]);
    expect(r.shifts).toEqual([]);
    expect(r.problems.map((x) => [x.index, x.code])).toEqual([
      [0, "unknown_employee"],
      [1, "outside_week"],
      [2, "invalid_time"],
      [3, "invalid_time"],
      [4, "break_too_long"],
    ]);
  });

  it("rejects overlaps with other proposed shifts and with existing shifts", () => {
    const r = check(
      [
        s({}),
        s({ start: "15:00", end: "20:00" }),
        s({ date: "2027-03-02", start: "06:00", end: "10:00" }),
      ],
      [{ employeeId: "mads", start: "2027-03-02T07:00:00Z", end: "2027-03-02T11:00:00Z" }],
    );
    expect(r.shifts.map((x) => x.start)).toEqual(["08:00"]);
    expect(r.problems.map((x) => [x.index, x.code])).toEqual([
      [1, "overlap"],
      [2, "overlap"],
    ]);
  });
});
