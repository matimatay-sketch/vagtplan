import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { validateSchedule } from "./index";
import { cph, makeInput, shift } from "../../test/support";

type Input = Parameters<typeof makeInput>[0];
const run = (intervals: ReturnType<typeof shift>[], from: string, to: string, input: Input = {}) =>
  validateSchedule({ ...makeInput(input), intervals, from, to });
const codes = (r: ReturnType<typeof validateSchedule>) =>
  r.violations.map((v) => `${v.code}@${v.date}:${v.severity}`);
const restCodes = (r: ReturnType<typeof validateSchedule>) =>
  codes(r).filter((c) => c.startsWith("REST"));

describe("daily rest (hviletid)", () => {
  it("exactly 11 hours of rest is allowed", () => {
    const r = run(
      [
        shift("2026-01-05 08:00", "2026-01-05 16:00"),
        shift("2026-01-06 03:00", "2026-01-06 08:00"),
      ],
      "2026-01-05",
      "2026-01-06",
    );
    expect(restCodes(r)).toEqual([]);
  });

  it("10 h 59 min of rest is blocking", () => {
    const r = run(
      [
        shift("2026-01-05 08:00", "2026-01-05 16:01"),
        shift("2026-01-06 03:00", "2026-01-06 08:00"),
      ],
      "2026-01-05",
      "2026-01-06",
    );
    expect(restCodes(r)).toContain("REST_DAILY@2026-01-06:BLOCKING");
    const v = r.violations.find((x) => x.code === "REST_DAILY")!;
    expect(v.details).toMatchObject({ requiredMinutes: 660, longestRestMinutes: 659 });
    expect(v.message).toContain("10 t 59 min");
  });

  it("a split shift is fine when the 24-hour period still has 11 hours of rest", () => {
    const r = run(
      [
        shift("2026-01-05 07:00", "2026-01-05 11:00"),
        shift("2026-01-05 15:00", "2026-01-05 19:00"),
        shift("2026-01-06 07:00", "2026-01-06 11:00"),
      ],
      "2026-01-05",
      "2026-01-06",
    );
    expect(restCodes(r)).toEqual([]);
  });

  it("a 14-hour shift leaves too little rest within 24 hours", () => {
    const r = run([shift("2026-01-05 06:00", "2026-01-05 20:00")], "2026-01-05", "2026-01-05");
    expect(restCodes(r)).toEqual(["REST_DAILY@2026-01-05:BLOCKING"]);
  });

  it("uses real elapsed time across DST: spring forward loses an hour", () => {
    // Wall clock 22:00 → 09:00 is 11 h, but 29 March 2026 has only 23 hours.
    const r = run(
      [
        shift("2026-03-28 14:00", "2026-03-28 22:00"),
        shift("2026-03-29 09:00", "2026-03-29 15:00"),
      ],
      "2026-03-28",
      "2026-03-29",
    );
    expect(restCodes(r)).toEqual(["REST_DAILY@2026-03-29:BLOCKING"]);
  });

  it("uses real elapsed time across DST: fall back gains an hour", () => {
    // Wall clock 22:00 → 08:00 is 10 h, but 25 October 2026 has 25 hours.
    const r = run(
      [
        shift("2026-10-24 14:00", "2026-10-24 22:00"),
        shift("2026-10-25 08:00", "2026-10-25 14:00"),
      ],
      "2026-10-24",
      "2026-10-25",
    );
    expect(restCodes(r)).toEqual([]);
  });

  it("history before the checked period is taken into account", () => {
    const r = run(
      [
        shift("2026-01-04 15:00", "2026-01-04 23:00"),
        shift("2026-01-05 06:00", "2026-01-05 12:00"),
      ],
      "2026-01-05",
      "2026-01-05",
    );
    expect(restCodes(r)).toContain("REST_DAILY@2026-01-05:BLOCKING");
  });
});

describe("weekly rest (fridøgn)", () => {
  const week = (days: number) =>
    Array.from({ length: days }, (_, i) =>
      shift(
        `2026-01-${String(5 + i).padStart(2, "0")} 08:00`,
        `2026-01-${String(5 + i).padStart(2, "0")} 16:00`,
      ),
    );

  it("seven working days in a calendar week is blocking", () => {
    expect(restCodes(run(week(7), "2026-01-05", "2026-01-11"))).toContain(
      "REST_WEEKLY@2026-01-05:BLOCKING",
    );
  });

  it("six working days leaves a 40-hour rest", () => {
    expect(restCodes(run(week(6), "2026-01-05", "2026-01-11"))).toEqual([]);
  });
});

describe("48-hour average", () => {
  // Reference period 1 Jan – 30 Apr 2026 (120 days = 17.14 weeks).
  const weeks = (hoursPerDay: number, days = 6) => {
    const out = [];
    for (
      let d = new Date(Date.UTC(2026, 0, 1));
      d < new Date(Date.UTC(2026, 4, 1));
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dow = d.getUTCDay();
      if ((dow === 0 && days < 7) || (dow === 6 && days < 6)) continue;
      const iso = d.toISOString().slice(0, 10);
      const endH = 6 + hoursPerDay;
      out.push(
        shift(
          `${iso} 06:00`,
          `${iso} ${String(Math.floor(endH)).padStart(2, "0")}:${endH % 1 ? "30" : "00"}`,
        ),
      );
    }
    return out;
  };

  it("above 48 hours on average is blocking", () => {
    expect(
      codes(run(weeks(8.5), "2026-01-01", "2026-04-30")).filter((c) => c.startsWith("MAX_WEEKLY")),
    ).toEqual(["MAX_WEEKLY_AVERAGE@2026-01-01:BLOCKING"]);
  });

  it("between 44 and 48 hours on average is a warning", () => {
    expect(
      codes(run(weeks(7.5), "2026-01-01", "2026-04-30")).filter((c) => c.startsWith("MAX_WEEKLY")),
    ).toEqual(["MAX_WEEKLY_AVERAGE@2026-01-01:WARNING"]);
  });

  it("absence days are neutral (excluded from the average)", () => {
    const shifts = weeks(7, 5); // ~35 h/week
    const r = validateSchedule({
      ...makeInput(),
      intervals: shifts,
      absences: [{ id: "a", type: "vacation", from: "2026-01-01", to: "2026-04-15" }],
      from: "2026-01-01",
      to: "2026-04-30",
    });
    // Remaining 15 days of the period would be well above 48 h/week if work in the absence were counted.
    expect(r.violations.some((v) => v.code === "MAX_WEEKLY_AVERAGE")).toBe(false);
  });
});

describe("break", () => {
  it("6:00 without break is fine, 6:01 is a warning", () => {
    expect(
      codes(run([shift("2026-01-05 08:00", "2026-01-05 14:00")], "2026-01-05", "2026-01-05")),
    ).toEqual([]);
    expect(
      codes(run([shift("2026-01-05 08:00", "2026-01-05 14:01")], "2026-01-05", "2026-01-05")),
    ).toEqual(["BREAK_MISSING@2026-01-05:WARNING"]);
  });

  it("a registered break satisfies the rule", () => {
    const s = shift("2026-01-05 08:00", "2026-01-05 16:00", {
      breaks: [["2026-01-05 12:00", "2026-01-05 12:30"]],
    });
    expect(codes(run([s], "2026-01-05", "2026-01-05"))).toEqual([]);
  });
});

describe("young workers", () => {
  const sixteen = { employee: { birthDate: "2010-05-20" } };

  it("16-year-old: 8 hours ok, 8 h 1 min blocking (break taken)", () => {
    const ok = shift("2026-01-05 08:00", "2026-01-05 16:30", {
      breaks: [["2026-01-05 12:00", "2026-01-05 12:30"]],
    });
    const tooLong = shift("2026-01-05 08:00", "2026-01-05 16:31", {
      breaks: [["2026-01-05 12:00", "2026-01-05 12:30"]],
    });
    expect(codes(run([ok], "2026-01-05", "2026-01-05", sixteen))).toEqual([]);
    expect(codes(run([tooLong], "2026-01-05", "2026-01-05", sixteen))).toEqual([
      "YOUNG_MAX_DAILY@2026-01-05:BLOCKING",
    ]);
  });

  it("16-year-old: a paid break counts as working time, an unpaid one does not", () => {
    const withBreak = (paid: boolean | undefined) => {
      const s = shift("2026-01-05 08:00", "2026-01-05 16:30");
      return {
        ...s,
        breaks: [{ start: cph("2026-01-05 12:00"), end: cph("2026-01-05 12:30"), paid }],
      };
    };
    // 8 h 30 min with a 30 min break: 8 h without the break, 8 h 30 min with it.
    expect(codes(run([withBreak(false)], "2026-01-05", "2026-01-05", sixteen))).toEqual([]);
    expect(codes(run([withBreak(undefined)], "2026-01-05", "2026-01-05", sixteen))).toEqual([]);
    expect(codes(run([withBreak(true)], "2026-01-05", "2026-01-05", sixteen))).toEqual([
      "YOUNG_MAX_DAILY@2026-01-05:BLOCKING",
    ]);
  });

  it("a paid break is still a break for the break rule", () => {
    const s = shift("2026-01-05 08:00", "2026-01-05 16:00");
    const paid = {
      ...s,
      breaks: [{ start: cph("2026-01-05 12:00"), end: cph("2026-01-05 12:30"), paid: true }],
    };
    expect(codes(run([paid], "2026-01-05", "2026-01-05", sixteen))).not.toContain(
      "YOUNG_BREAK@2026-01-05:BLOCKING",
    );
  });

  it("16-year-old: a shift across midnight counts on both days", () => {
    const r = run(
      [
        shift("2026-01-05 20:00", "2026-01-06 02:00", {
          breaks: [["2026-01-05 23:00", "2026-01-05 23:30"]],
        }),
      ],
      "2026-01-05",
      "2026-01-06",
      sixteen,
    );
    expect(r.violations.filter((v) => v.code === "YOUNG_MAX_DAILY")).toEqual([]);
  });

  it("16-year-old: needs 12 hours rest and 30 min break after 4.5 hours", () => {
    const r = run(
      [
        shift("2026-01-05 08:00", "2026-01-05 12:31"),
        shift("2026-01-06 00:30", "2026-01-06 04:00"),
      ],
      "2026-01-05",
      "2026-01-06",
      sixteen,
    );
    expect(codes(r)).toEqual(
      expect.arrayContaining(["YOUNG_BREAK@2026-01-05:BLOCKING", "REST_DAILY@2026-01-06:BLOCKING"]),
    );
    expect(r.violations.find((v) => v.code === "REST_DAILY")!.details.requiredMinutes).toBe(720);
    expect(codes(r)).not.toContain("BREAK_MISSING@2026-01-05:WARNING");
  });

  it("16-year-old: max 40 hours per week", () => {
    const days = ["05", "06", "07", "08", "09"].map((d) =>
      shift(`2026-01-${d} 08:00`, `2026-01-${d} 16:30`, {
        breaks: [[`2026-01-${d} 12:00`, `2026-01-${d} 12:30`]],
      }),
    );
    expect(codes(run(days, "2026-01-05", "2026-01-11", sixteen))).toEqual([]);
    days.push(shift("2026-01-10 08:00", "2026-01-10 08:01"));
    expect(codes(run(days, "2026-01-05", "2026-01-11", sixteen))).toContain(
      "YOUNG_MAX_WEEKLY@2026-01-05:BLOCKING",
    );
  });

  it("rules stop on the 18th birthday mid-week", () => {
    const input = { employee: { birthDate: "2008-01-07" } }; // turns 18 on Wed 7 Jan 2026
    const nine = (d: string) =>
      shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:30`, {
        breaks: [[`2026-01-${d} 12:00`, `2026-01-${d} 12:30`]],
      });
    const r = run([nine("06"), nine("07")], "2026-01-06", "2026-01-07", input);
    expect(codes(r)).toEqual(["YOUNG_MAX_DAILY@2026-01-06:BLOCKING"]);
  });

  it("14-year-old: 2 hours on school days, up to 7 hours on other days", () => {
    const input = { employee: { birthDate: "2011-06-01", schoolObligated: true } };
    expect(
      codes(
        run([shift("2026-01-05 15:00", "2026-01-05 17:01")], "2026-01-05", "2026-01-05", input),
      ),
    ).toEqual(["YOUNG_MAX_DAILY@2026-01-05:BLOCKING"]);
    const saturday = shift("2026-01-10 09:00", "2026-01-10 16:30", {
      breaks: [["2026-01-10 12:00", "2026-01-10 12:30"]],
    });
    expect(codes(run([saturday], "2026-01-10", "2026-01-10", input))).toEqual([]);
  });

  it("school days can be supplied explicitly (school holidays)", () => {
    const input = {
      employee: { birthDate: "2011-06-01", schoolObligated: true },
      schoolDays: [] as string[],
    };
    expect(
      codes(
        run([shift("2026-01-05 09:00", "2026-01-05 13:00")], "2026-01-05", "2026-01-05", input),
      ),
    ).toEqual([]);
  });
});

describe("agreement-specific validations", () => {
  const doc = parseAgreementDocument({
    id: "test-agreement",
    name: "Test",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "test",
    rules: [
      {
        id: "min-vagt",
        primitive: "min_shift",
        source: "test",
        params: { min_minutes: 180, guarantee_pay: true, pay_code: "GARANTI" },
      },
      {
        id: "nat",
        primitive: "night_work",
        source: "test",
        params: {
          from: "23:00",
          to: "06:00",
          night_shift_min_minutes: 180,
          max_average_daily_minutes: 480,
          reference_days: 7,
        },
      },
    ],
  });
  const input = { extraDocs: [doc], agreementId: "test-agreement" };

  it("a shift shorter than the minimum is a warning", () => {
    expect(
      codes(
        run([shift("2026-01-05 08:00", "2026-01-05 10:59")], "2026-01-05", "2026-01-05", input),
      ),
    ).toEqual(["MIN_SHIFT@2026-01-05:WARNING"]);
  });

  it("night workers above 8 hours a day on average get a warning", () => {
    const nights = ["05", "06", "07", "08", "09", "10"].map((d) => {
      const next = String(Number(d) + 1).padStart(2, "0");
      return shift(`2026-01-${d} 21:00`, `2026-01-${next} 07:00`, {
        breaks: [[`2026-01-${next} 01:00`, `2026-01-${next} 01:30`]],
      });
    });
    const r = run(nights, "2026-01-05", "2026-01-11", input);
    expect(r.violations.some((v) => v.code === "NIGHT_AVERAGE" && v.severity === "WARNING")).toBe(
      true,
    );
  });
});
