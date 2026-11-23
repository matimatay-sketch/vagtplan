import { describe, expect, it } from "vitest";
import { finalRuleSchema, parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { validateSchedule } from "./index";
import { makeInput, shift } from "../../test/support";

const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "remark-test",
    name: "Anmærkninger",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "x",
    rules,
  });

const remark = (
  id: string,
  condition: Record<string, unknown>,
  extra: Partial<RuleLayer> & { show_in?: string[] } = {},
): RuleLayer => {
  const { show_in, ...rest } = extra;
  return {
    id,
    primitive: "remark",
    source: "Virksomhedens ønske",
    ...rest,
    params: {
      code: id.toUpperCase().replace(/-/g, "_"),
      message: `Anmærkning ${id}`,
      condition,
      ...(show_in ? { show_in } : {}),
    },
  };
};

function remarks(
  rules: RuleLayer[],
  intervals: ReturnType<typeof shift>[],
  range: { from: string; to: string },
  context?: "schedule" | "time",
) {
  const input = makeInput({ extraDocs: [doc(rules)], agreementId: "remark-test" });
  return validateSchedule({ ...input, intervals, ...range, ...(context ? { context } : {}) })
    .violations.filter((v) => v.primitive === "remark")
    .map((v) => [v.code, v.severity, v.date, v.intervalIds.join(",")]);
}

describe("remark: shift length (start to end)", () => {
  const rules = [
    remark("lang-vagt", { type: "shift_longer_than", minutes: 600 }),
    remark("kort-vagt", { type: "shift_shorter_than", minutes: 180 }, { severity: "INFO" }),
  ];
  const week = { from: "2026-01-05", to: "2026-01-11" };

  it("exactly 10 hours is fine, 10 h 1 min is flagged; breaks do not shorten the shift", () => {
    expect(
      remarks(
        rules,
        [
          shift("2026-01-05 08:00", "2026-01-05 18:00", { id: "ok" }),
          shift("2026-01-06 08:00", "2026-01-06 18:01", {
            id: "lang",
            breaks: [["2026-01-06 12:00", "2026-01-06 12:30"]],
          }),
        ],
        week,
      ),
    ).toEqual([["LANG_VAGT", "WARNING", "2026-01-06", "lang"]]);
  });

  it("short shifts: 3 hours is fine, 2 h 59 min is flagged with its own severity", () => {
    expect(
      remarks(
        rules,
        [
          shift("2026-01-07 08:00", "2026-01-07 11:00", { id: "ok" }),
          shift("2026-01-08 08:00", "2026-01-08 10:59", { id: "kort" }),
        ],
        week,
      ),
    ).toEqual([["KORT_VAGT", "INFO", "2026-01-08", "kort"]]);
  });

  it("measures real time across the DST change (01:00–05:00 on 29 March 2026 is 3 hours, 04:59 is less)", () => {
    expect(
      remarks(
        rules,
        [
          shift("2026-03-29 01:00", "2026-03-29 05:00", { id: "ok" }),
          shift("2026-03-29 01:00", "2026-03-29 04:59", { id: "dst" }),
        ],
        {
          from: "2026-03-23",
          to: "2026-03-29",
        },
      ),
    ).toEqual([["KORT_VAGT", "INFO", "2026-03-29", "dst"]]);
  });

  it("on-call is not a shift", () => {
    expect(
      remarks(rules, [shift("2026-01-05 08:00", "2026-01-05 09:00", { kind: "on_call" })], week),
    ).toEqual([]);
  });
});

describe("remark: time of day", () => {
  const rules = [
    remark("tidlig", { type: "starts_before", time: "06:00" }),
    remark("sen", { type: "ends_after", time: "23:00" }),
  ];
  const week = { from: "2026-01-05", to: "2026-01-11" };

  it("a start at 06:00 is fine, 05:59 is early; an end at 23:00 is fine, 23:01 is late", () => {
    expect(
      remarks(
        rules,
        [
          shift("2026-01-05 06:00", "2026-01-05 14:00", { id: "a" }),
          shift("2026-01-06 05:59", "2026-01-06 14:00", { id: "b" }),
          shift("2026-01-07 15:00", "2026-01-07 23:00", { id: "c" }),
          shift("2026-01-08 15:00", "2026-01-08 23:01", { id: "d" }),
        ],
        week,
      ),
    ).toEqual([
      ["TIDLIG", "WARNING", "2026-01-06", "b"],
      ["SEN", "WARNING", "2026-01-08", "d"],
    ]);
  });

  it("a shift over midnight ends after 23:00 on its start day, but does not start early", () => {
    expect(
      remarks(rules, [shift("2026-01-09 22:00", "2026-01-10 06:00", { id: "nat" })], week),
    ).toEqual([["SEN", "WARNING", "2026-01-09", "nat"]]);
  });
});

describe("remark: days in a row and hours per week", () => {
  const days = (dates: string[]) => dates.map((d) => shift(`${d} 08:00`, `${d} 16:00`, { id: d }));

  it("6 days in a row is fine, the 7th is flagged, also when the run started before the range", () => {
    const rules = [remark("mange-dage", { type: "consecutive_days", max_days: 6 })];
    const run = [
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
    ];
    expect(remarks(rules, days(run), { from: "2026-01-01", to: "2026-01-11" })).toEqual([]);
    expect(
      remarks(rules, days([...run, "2026-01-07", "2026-01-08"]), {
        from: "2026-01-05",
        to: "2026-01-11",
      }),
    ).toEqual([
      ["MANGE_DAGE", "WARNING", "2026-01-07", "2026-01-07"],
      ["MANGE_DAGE", "WARNING", "2026-01-08", "2026-01-08"],
    ]);
  });

  it("hours per week count working time (unpaid breaks excluded): 45 h is fine, 45 h 1 min is not", () => {
    const rules = [remark("mange-timer", { type: "weekly_hours", max_minutes: 2700 })];
    // Mon–Fri 9 hours each = 45 h.
    const week = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map((d) =>
      shift(`${d} 07:00`, `${d} 16:30`, { id: d, breaks: [[`${d} 12:00`, `${d} 12:30`]] }),
    );
    const range = { from: "2026-01-05", to: "2026-01-11" };
    expect(remarks(rules, week, range)).toEqual([]);
    const more = [...week, shift("2026-01-10 08:00", "2026-01-10 08:01", { id: "extra" })];
    expect(remarks(rules, more, range)).toEqual([
      [
        "MANGE_TIMER",
        "WARNING",
        "2026-01-05",
        "2026-01-05,2026-01-06,2026-01-07,2026-01-08,2026-01-09,extra",
      ],
    ]);
  });
});

describe("remark: break and rest", () => {
  const range = { from: "2026-01-05", to: "2026-01-11" };

  it("break: a shift over 8 hours needs 30 minutes; exactly 8 hours needs none", () => {
    const rules = [
      remark("pause-anm", { type: "break_below", shift_over_minutes: 480, min_break_minutes: 30 }),
    ];
    expect(
      remarks(
        rules,
        [
          shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "otte" }),
          shift("2026-01-06 08:00", "2026-01-06 16:30", {
            id: "nok",
            breaks: [["2026-01-06 12:00", "2026-01-06 12:30"]],
          }),
          shift("2026-01-07 08:00", "2026-01-07 16:30", {
            id: "for-lidt",
            breaks: [["2026-01-07 12:00", "2026-01-07 12:29"]],
          }),
        ],
        range,
      ),
    ).toEqual([["PAUSE_ANM", "WARNING", "2026-01-07", "for-lidt"]]);
  });

  it("rest: under 12 hours between two shifts is flagged on the later shift; exactly 12 is fine", () => {
    const rules = [remark("hvile", { type: "rest_below", min_minutes: 720 })];
    expect(
      remarks(
        rules,
        [
          shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "a" }),
          shift("2026-01-06 04:00", "2026-01-06 12:00", { id: "b" }),
          shift("2026-01-07 00:00", "2026-01-07 03:00", { id: "c" }),
          shift("2026-01-07 14:59", "2026-01-07 20:00", { id: "d" }),
        ],
        range,
      ),
    ).toEqual([["HVILE", "WARNING", "2026-01-07", "d"]]);
  });
});

describe("remark: where it is shown and to whom it applies", () => {
  const range = { from: "2026-01-05", to: "2026-01-11" };
  const s = [shift("2026-01-05 08:00", "2026-01-05 20:00", { id: "x" })];

  it("show_in limits the remark to the schedule or to time approval; no context shows all", () => {
    const rules = [
      remark("kun-plan", { type: "shift_longer_than", minutes: 600 }, { show_in: ["schedule"] }),
      remark("kun-tid", { type: "shift_longer_than", minutes: 600 }, { show_in: ["time"] }),
    ];
    const codes = (c?: "schedule" | "time") => remarks(rules, s, range, c).map((r) => r[0]);
    expect(codes("schedule")).toEqual(["KUN_PLAN"]);
    expect(codes("time")).toEqual(["KUN_TID"]);
    expect(codes()).toEqual(["KUN_PLAN", "KUN_TID"]);
  });

  it("applies_to limits a remark to staff groups like any rule", () => {
    const rules = [
      remark(
        "elever",
        { type: "shift_longer_than", minutes: 600 },
        { applies_to: { staff_groups: ["elev"] } },
      ),
    ];
    expect(remarks(rules, s, range)).toEqual([]);
  });

  it("the message is the configured text with the measured value, and blocking is allowed", () => {
    const input = makeInput({
      extraDocs: [
        doc([
          remark("lang", { type: "shift_longer_than", minutes: 600 }, { severity: "BLOCKING" }),
        ]),
      ],
      agreementId: "remark-test",
    });
    const v = validateSchedule({ ...input, intervals: s, ...range }).violations.find(
      (x) => x.primitive === "remark",
    )!;
    expect(v.severity).toBe("BLOCKING");
    expect(v.message).toBe("Anmærkning lang (12 t)");
    expect(v.details).toMatchObject({ measuredMinutes: 720, limitMinutes: 600 });
  });

  it("the schema rejects a lower-case code and an empty show_in", () => {
    const base = {
      id: "x",
      primitive: "remark",
      source: "s",
      params: { code: "LANG", message: "m", condition: { type: "shift_longer_than", minutes: 1 } },
    };
    const schema = finalRuleSchema("remark");
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, params: { ...base.params, code: "lang" } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...base, params: { ...base.params, show_in: [] } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...base, severity: "INFO" }).success).toBe(true);
  });
});

describe("remark from the organization layer (own rules on top of every agreement)", () => {
  it("flags shifts under any agreement", () => {
    const input = makeInput({});
    const v = validateSchedule({
      ...input,
      organizationLayer: {
        rules: [
          remark("egen-lang", { type: "shift_longer_than", minutes: 720 }, { severity: "INFO" }),
        ],
      },
      intervals: [shift("2027-08-23 06:00", "2027-08-23 20:00")],
      from: "2027-08-23",
      to: "2027-08-23",
      context: "schedule",
    }).violations.filter((x) => x.primitive === "remark");
    expect(v.map((x) => [x.code, x.severity, x.message])).toEqual([
      ["EGEN_LANG", "INFO", "Anmærkning egen-lang (14 t)"],
    ]);
  });
});
