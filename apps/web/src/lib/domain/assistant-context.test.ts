import { describe, expect, it } from "vitest";
import { Pseudonyms } from "./pseudonyms";
import { payContext, scheduleContext } from "./assistant-context";

describe("payContext", () => {
  it("describes pay lines with their rule, source and periods, without names", () => {
    const p = new Pseudonyms();
    const ctx = payContext(
      {
        employee: { id: "e1", name: "Mads Medarbejder", number: "1002" },
        period: { start: "2027-01-04", end: "2027-01-17" },
        lines: [
          {
            pay_code: "AFTEN",
            label: "Aftentillæg",
            unit: "hours",
            quantity_minutes: 90,
            rate_ore: 2500,
            amount_ore: 3750,
            posting: { dim1: "v1" },
            explanation: {
              ruleId: "aften",
              primitive: "time_window_supplement",
              source: "§ 7",
              layer: { agreementId: "eksempel-detail", version: 1 },
              note: null,
              intervals: [{ date: "2027-01-05", start: "18:00", end: "19:30", minutes: 90 }],
            },
          },
        ],
        notes: [{ code: "NO_PAY_RATE", message: "Ingen sats" }],
        ruleParams: { "eksempel-detail@1#aften": { amount: { type: "ore_per_hour", ore: 2500 } } },
        postingNames: { dim1: "Omkostningssted", v1: "1100" },
      },
      p,
    );
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("Mads");
    expect(json).not.toContain("1002");
    expect(ctx.employee).toBe("MEDARBEJDER_1");
    expect(ctx.lines[0]).toMatchObject({
      pay_code: "AFTEN",
      quantity: "1,50 timer",
      rate_kr: "25,00",
      amount_kr: "37,50",
      posting: { Omkostningssted: "1100" },
      rule: {
        id: "aften",
        type: "time_window_supplement",
        source: "§ 7",
        agreement: "eksempel-detail v1",
        params: { amount: { type: "ore_per_hour", ore: 2500 } },
      },
      periods: ["2027-01-05 18:00–19:30 (90 min)"],
    });
  });
});

describe("scheduleContext", () => {
  it("lists people by code with what the plan needs, and no names", () => {
    const p = new Pseudonyms();
    const ctx = scheduleContext(
      {
        department: { id: "d1", name: "Butik" },
        weekDates: ["2027-03-01", "2027-03-07"],
        employees: [
          {
            id: "e1",
            name: "Ida Ung",
            weeklyNormMinutes: 900,
            under18: true,
            availability: [{ date: "2027-03-02", kind: "unavailable", from: null, to: null }],
            absences: [{ from: "2027-03-04", to: "2027-03-05", type: "vacation" }],
          },
        ],
        existing: [
          {
            employeeId: "e1",
            start: "2027-03-01T07:00:00Z",
            end: "2027-03-01T11:00:00Z",
            status: "published",
          },
        ],
        templates: [{ name: "Dagvagt", start: "08:00", end: "16:00", breakMinutes: 30 }],
      },
      p,
    );
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("Ida");
    expect(json).not.toContain("Butik");
    expect(ctx.department).toBe("AFDELING_1");
    expect(ctx.employees[0]).toEqual({
      code: "MEDARBEJDER_1",
      weekly_norm_hours: 15,
      under_18: true,
      unavailable: ["2027-03-02 hele dagen"],
      absence: ["2027-03-04–2027-03-05 (vacation)"],
    });
    expect(ctx.existing_shifts).toEqual([
      {
        employee: "MEDARBEJDER_1",
        date: "2027-03-01",
        start: "08:00",
        end: "12:00",
        status: "published",
      },
    ]);
  });
});
