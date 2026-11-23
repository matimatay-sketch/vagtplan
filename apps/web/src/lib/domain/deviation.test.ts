import { describe, expect, it } from "vitest";
import {
  payAdjustments,
  reasonsFor,
  situations,
  stampQuestion,
  type DeviationReason,
} from "./deviation";

// Planned Monday 2 March 2026 08:00–16:00 Copenhagen (07:00–15:00 UTC).
const plan = { start: "2026-03-02T07:00:00.000Z", end: "2026-03-02T15:00:00.000Z" };
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(2026, 2, 2, h - 1, m)).toISOString();
};

describe("situations", () => {
  it("early or late at each end, beyond the threshold", () => {
    expect(situations({ start: at("07:30"), end: at("16:45") }, plan, 5)).toEqual({
      start: { kind: "early_in", minutes: 30 },
      end: { kind: "late_out", minutes: 45 },
      unplanned: false,
    });
    expect(situations({ start: at("08:20"), end: at("15:00") }, plan, 5)).toEqual({
      start: { kind: "late_in", minutes: 20 },
      end: { kind: "early_out", minutes: 60 },
      unplanned: false,
    });
  });
  it("within the threshold (inclusive) asks nothing", () => {
    expect(situations({ start: at("07:55"), end: at("16:05") }, plan, 5)).toEqual({
      start: null,
      end: null,
      unplanned: false,
    });
  });
  it("an open registration only has a start; without a plan it is unplanned", () => {
    expect(situations({ start: at("07:30"), end: null }, plan, 5).end).toBeNull();
    expect(situations({ start: at("07:30"), end: at("09:00") }, null, 5)).toEqual({
      start: null,
      end: null,
      unplanned: true,
    });
  });
});

const reasons: DeviationReason[] = [
  {
    id: "afsp",
    name: "Afspadsering",
    applies_to: ["early_in", "late_out", "unplanned"],
    treatment: "time_off",
    time_off_mode: "agreement",
    time_off_factor_bp: 10000,
    time_off_pay_code: null,
    absence_type: null,
  },
  {
    id: "afsp11",
    name: "Afspadsering 1:1",
    applies_to: ["late_out", "unplanned"],
    treatment: "time_off",
    time_off_mode: "factor",
    time_off_factor_bp: 10000,
    time_off_pay_code: "AFSP",
    absence_type: null,
  },
  {
    id: "laege",
    name: "Lægebesøg",
    applies_to: ["late_in", "early_out"],
    treatment: "absence",
    time_off_mode: "agreement",
    time_off_factor_bp: 10000,
    time_off_pay_code: null,
    absence_type: "doctor",
  },
  {
    id: "trafik",
    name: "Trafik",
    applies_to: ["late_in"],
    treatment: "none",
    time_off_mode: "agreement",
    time_off_factor_bp: 10000,
    time_off_pay_code: null,
    absence_type: null,
  },
];

describe("reasonsFor", () => {
  it("only the reasons set up for the situation", () => {
    expect(reasonsFor("late_in", reasons).map((r) => r.id)).toEqual(["laege", "trafik"]);
    expect(reasonsFor("unplanned", reasons).map((r) => r.id)).toEqual(["afsp", "afsp11"]);
  });
});

describe("payAdjustments", () => {
  const byId = (id: string) => reasons.find((r) => r.id === id) ?? null;

  it("no reasons: the registration is paid as it is", () => {
    const entry = { start: at("07:30"), end: at("16:45") };
    expect(payAdjustments(entry, plan, null, null)).toEqual({
      parts: [{ start: entry.start, end: entry.end, overtimeAsTimeOff: false }],
      timeOff: [],
      absence: [],
    });
  });

  it("time off by the agreement: the extra time is its own part with overtime as time off", () => {
    const r = payAdjustments(
      { start: at("07:30"), end: at("16:45") },
      plan,
      byId("afsp"),
      byId("afsp"),
    );
    expect(r.parts).toEqual([
      { start: at("07:30"), end: at("08:00"), overtimeAsTimeOff: true },
      { start: at("08:00"), end: at("16:00"), overtimeAsTimeOff: false },
      { start: at("16:00"), end: at("16:45"), overtimeAsTimeOff: true },
    ]);
    expect(r.timeOff).toEqual([]);
  });

  it("time off by a factor: the extra time is not paid but credited (1:1, 45 min)", () => {
    const r = payAdjustments({ start: at("08:00"), end: at("16:45") }, plan, null, byId("afsp11"));
    expect(r.parts).toEqual([{ start: at("08:00"), end: at("16:00"), overtimeAsTimeOff: false }]);
    expect(r.timeOff).toEqual([{ payCode: "AFSP", minutes: 45, reason: "Afspadsering 1:1" }]);
  });

  it("absence: the missing time at either end becomes absence of the type", () => {
    const r = payAdjustments(
      { start: at("09:30"), end: at("15:00") },
      plan,
      byId("laege"),
      byId("laege"),
    );
    expect(r.parts).toEqual([{ start: at("09:30"), end: at("15:00"), overtimeAsTimeOff: false }]);
    // 90 minutes late + 60 minutes early.
    expect(r.absence).toEqual([{ type: "doctor", date: "2026-03-02", minutes: 150 }]);
  });

  it("unplanned with time off by a factor: the whole registration is credited", () => {
    const r = payAdjustments({ start: at("10:00"), end: at("12:30") }, null, byId("afsp11"), null);
    expect(r.parts).toEqual([]);
    expect(r.timeOff).toEqual([{ payCode: "AFSP", minutes: 150, reason: "Afspadsering 1:1" }]);
  });

  it("a reason that does not fit the situation does nothing (e.g. time off for coming late)", () => {
    const r = payAdjustments({ start: at("08:30"), end: at("16:00") }, plan, byId("afsp"), null);
    expect(r).toEqual({
      parts: [{ start: at("08:30"), end: at("16:00"), overtimeAsTimeOff: false }],
      timeOff: [],
      absence: [],
    });
  });

  it("a 'none' reason only records", () => {
    const r = payAdjustments({ start: at("08:30"), end: at("16:00") }, plan, byId("trafik"), null);
    expect(r.absence).toEqual([]);
  });
});

describe("stampQuestion", () => {
  const opts = reasons;
  it("stamping in 30 minutes early asks with the reasons for coming early", () => {
    const q = stampQuestion("in", at("07:30"), { candidates: [plan], openPlan: null }, opts, 5);
    expect(q).toMatchObject({ situation: "early_in", minutes: 30, at: "start" });
    expect(q!.options.map((r) => r.id)).toEqual(["afsp"]);
  });
  it("within the threshold nothing is asked", () => {
    expect(
      stampQuestion("in", at("07:57"), { candidates: [plan], openPlan: null }, opts, 5),
    ).toBeNull();
  });
  it("without a shift within 4 hours it is unplanned", () => {
    const q = stampQuestion("in", at("20:00"), { candidates: [plan], openPlan: null }, opts, 5);
    expect(q).toMatchObject({ situation: "unplanned", at: "start" });
  });
  it("stamping out late asks about the end; an unplanned registration was asked when stamping in", () => {
    expect(
      stampQuestion("out", at("16:40"), { candidates: [], openPlan: plan }, opts, 5),
    ).toMatchObject({ situation: "late_out", minutes: 40, at: "end" });
    expect(
      stampQuestion("out", at("16:40"), { candidates: [], openPlan: null }, opts, 5),
    ).toBeNull();
  });
  it("no reasons set up for the situation: nothing is asked", () => {
    expect(
      stampQuestion("out", at("15:00"), { candidates: [], openPlan: plan }, [opts[0]!], 5),
    ).toBeNull();
  });
});
