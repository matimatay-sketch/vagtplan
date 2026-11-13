import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "./agreement/schema";
import { dailyWorkingMinutes, roundRegistrations } from "./registrations";
import { cph, makeInput, shift } from "../test/support";

const rounding = parseAgreementDocument({
  id: "afrund",
  name: "Afrunding",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "x",
  rules: [
    {
      id: "afrunding",
      primitive: "rounding",
      source: "§ 7",
      params: {
        unit_minutes: 15,
        start: "nearest",
        end: "nearest",
        snap_before_start_minutes: 10,
        snap_after_end_minutes: 10,
      },
    },
  ],
});

describe("roundRegistrations", () => {
  const input = makeInput({ extraDocs: [rounding], agreementId: "afrund" });

  it("snaps to the planned shift within the tolerance, otherwise rounds to the unit", () => {
    const planned = [shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "p" })];
    const worked = [
      // 10 min early and 10 min late: snapped to the plan.
      shift("2026-01-05 07:50", "2026-01-05 16:10", { id: "a", plannedShiftId: "p" }),
      // 11 min early is outside the tolerance: 07:49 rounds to 07:45.
      shift("2026-01-05 07:49", "2026-01-05 16:07", { id: "b", plannedShiftId: "p" }),
    ];
    expect(roundRegistrations({ ...input, worked, planned })).toEqual([
      { id: "a", start: cph("2026-01-05 08:00"), end: cph("2026-01-05 16:00") },
      { id: "b", start: cph("2026-01-05 07:45"), end: cph("2026-01-05 16:00") },
    ]);
  });

  it("returns the registration unchanged without a rounding rule", () => {
    const worked = [shift("2026-01-05 07:52", "2026-01-05 16:07", { id: "a" })];
    expect(roundRegistrations({ ...makeInput(), worked })).toEqual([
      { id: "a", start: cph("2026-01-05 07:52"), end: cph("2026-01-05 16:07") },
    ]);
  });
});

describe("dailyWorkingMinutes", () => {
  it("splits at local midnight and subtracts unpaid breaks", () => {
    const s = shift("2026-01-05 20:00", "2026-01-06 04:00", {
      breaks: [["2026-01-05 23:30", "2026-01-06 00:30"]],
    });
    expect(dailyWorkingMinutes({ ...makeInput(), intervals: [s] })).toEqual({
      "2026-01-05": 210,
      "2026-01-06": 210,
    });
  });

  it("counts paid breaks as working time", () => {
    const s = shift("2026-01-05 08:00", "2026-01-05 16:00");
    const withPaid = {
      ...s,
      breaks: [{ start: cph("2026-01-05 12:00"), end: cph("2026-01-05 12:30"), paid: true }],
    };
    expect(dailyWorkingMinutes({ ...makeInput(), intervals: [withPaid] })).toEqual({
      "2026-01-05": 480,
    });
  });

  it("a night across the spring DST change has one hour less", () => {
    // 29 March 2026: clocks go from 02:00 to 03:00.
    const s = shift("2026-03-28 22:00", "2026-03-29 06:00");
    expect(dailyWorkingMinutes({ ...makeInput(), intervals: [s] })).toEqual({
      "2026-03-28": 120,
      "2026-03-29": 300,
    });
  });

  it("several registrations on one day add up; on-call time does not count", () => {
    const r = dailyWorkingMinutes({
      ...makeInput(),
      intervals: [
        shift("2026-01-05 08:00", "2026-01-05 11:00"),
        shift("2026-01-05 17:00", "2026-01-05 19:15"),
        shift("2026-01-05 19:15", "2026-01-05 23:00", { kind: "on_call" }),
      ],
    });
    expect(r).toEqual({ "2026-01-05": 315 });
  });
});
