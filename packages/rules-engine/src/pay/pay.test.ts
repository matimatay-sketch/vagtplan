import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import type { ContractFacts } from "../model";
import { calculatePay, type PayResult } from "./index";
import { makeInput, shift } from "../../test/support";

/** Test agreement – all numbers are test values, not real rates. */
const doc = parseAgreementDocument({
  id: "pay-test",
  name: "Pay test",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "unit test",
  pay_codes: { NORMAL: { label: "Timeløn" } },
  rules: [
    {
      id: "sats",
      primitive: "pay_rate",
      source: "§1",
      params: {
        pay_code: "NORMAL",
        rates: [{ hourly_ore: 15000 }, { max_age: 18, hourly_ore: 9000 }],
      },
    },
    { id: "norm", primitive: "norm", source: "§2", params: { period: { type: "week" } } },
    {
      id: "ot",
      primitive: "overtime",
      source: "§3",
      params: {
        trigger: "weekly_norm",
        tiers: [
          { up_to_minutes: 180, amount: { type: "percent_of_base", bp: 5000 }, pay_code: "OT50" },
          {
            up_to_minutes: null,
            amount: { type: "percent_of_base", bp: 10000 },
            pay_code: "OT100",
          },
        ],
      },
    },
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "§4",
      stacking: { mode: "highest", group: "tid" },
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 3000 },
        pay_code: "AFTEN",
      },
    },
    {
      id: "nat",
      primitive: "time_window_supplement",
      source: "§5",
      stacking: { mode: "highest", group: "tid" },
      params: {
        windows: [{ days: ["any"], from: "00:00", to: "06:00" }],
        exclude_holidays: false,
        amount: { type: "ore_per_hour", ore: 4500 },
        pay_code: "NAT",
      },
    },
    {
      id: "soen",
      primitive: "time_window_supplement",
      source: "§6",
      stacking: { mode: "highest", group: "tid" },
      params: {
        windows: [{ days: ["sun", "holiday"], from: "00:00", to: "24:00" }],
        exclude_holidays: false,
        amount: { type: "percent_of_base", bp: 5000 },
        pay_code: "SOEN",
      },
    },
    {
      id: "afrunding",
      primitive: "rounding",
      source: "§7",
      params: {
        unit_minutes: 15,
        start: "nearest",
        end: "nearest",
        snap_before_start_minutes: 10,
        snap_after_end_minutes: 10,
      },
    },
    {
      id: "raadighed",
      primitive: "on_call",
      source: "§8",
      params: {
        amount: { type: "ore_per_hour", ore: 2000 },
        pay_code: "RAADIGHED",
        call_out_min_minutes: 180,
        call_out_guarantee_pay_code: "TILKALD_GARANTI",
      },
    },
    {
      id: "min-vagt",
      primitive: "min_shift",
      source: "§9",
      params: { min_minutes: 180, guarantee_pay: true, pay_code: "GARANTI" },
    },
    {
      id: "fravaer",
      primitive: "absence",
      source: "§10",
      params: {
        types: [
          {
            code: "sick",
            label: "Sygdom",
            payment: "full",
            pay_code: "SYG",
            counts_towards_norm: true,
          },
        ],
      },
    },
  ],
});

type Opts = {
  overrides?: RuleLayer[];
  contract?: Partial<ContractFacts>;
  contracts?: ContractFacts[];
  birthDate?: string;
};

function pay(
  worked: ReturnType<typeof shift>[],
  from: string,
  to: string,
  opts: Opts = {},
  extra: Partial<Parameters<typeof calculatePay>[0]> = {},
) {
  const base = makeInput({
    extraDocs: [doc],
    agreementId: "pay-test",
    contract: { ...opts.contract, overrides: opts.overrides ? { rules: opts.overrides } : null },
    ...(opts.contracts ? { contracts: opts.contracts } : {}),
    employee: opts.birthDate ? { birthDate: opts.birthDate } : {},
  });
  return calculatePay({ ...base, worked, period: { from, to }, ...extra });
}

/** pay code → total minutes and øre */
function sums(r: PayResult) {
  const out: Record<string, { minutes: number; amount: number }> = {};
  for (const l of r.lines) {
    out[l.payCode] ??= { minutes: 0, amount: 0 };
    out[l.payCode]!.minutes += l.quantityMinutes;
    out[l.payCode]!.amount += l.amountOre;
  }
  return out;
}

describe("calculatePay – basics", () => {
  it("pays normal hours minus unpaid break", () => {
    const r = pay(
      [
        shift("2026-01-05 08:00", "2026-01-05 16:00", {
          breaks: [["2026-01-05 12:00", "2026-01-05 12:30"]],
        }),
      ],
      "2026-01-05",
      "2026-01-05",
    );
    expect(sums(r)).toEqual({ NORMAL: { minutes: 450, amount: 112500 } });
    expect(r.dailyMinutes).toEqual({ "2026-01-05": 450 });
  });

  it("evening supplement only inside the window", () => {
    const r = pay([shift("2026-01-05 16:00", "2026-01-05 20:00")], "2026-01-05", "2026-01-05");
    expect(sums(r)).toEqual({
      NORMAL: { minutes: 240, amount: 60000 },
      AFTEN: { minutes: 120, amount: 6000 },
    });
  });

  it("a shift across midnight crosses two supplement windows", () => {
    const r = pay([shift("2026-01-05 22:00", "2026-01-06 02:00")], "2026-01-05", "2026-01-06");
    expect(sums(r)).toEqual({
      NORMAL: { minutes: 240, amount: 60000 },
      AFTEN: { minutes: 120, amount: 6000 },
      NAT: { minutes: 120, amount: 9000 },
    });
    expect(r.dailyMinutes).toEqual({ "2026-01-05": 120, "2026-01-06": 120 });
  });

  it("pays real elapsed time over the spring DST change", () => {
    // 22:00–06:00 wall clock on the night to Sunday 29 March 2026 is 7 real hours.
    const r = pay([shift("2026-03-28 22:00", "2026-03-29 06:00")], "2026-03-28", "2026-03-29");
    expect(sums(r).NORMAL).toEqual({ minutes: 420, amount: 105000 });
    // Saturday 22–24 has no weekday evening supplement; Sunday 00–06 (5 real hours) is Sunday, which beats night.
    expect(sums(r).SOEN).toEqual({ minutes: 300, amount: 37500 });
    expect(sums(r).NAT).toBeUndefined();
  });

  it("pays real elapsed time over the autumn DST change", () => {
    const r = pay([shift("2026-10-24 22:00", "2026-10-25 06:00")], "2026-10-24", "2026-10-25");
    expect(sums(r).NORMAL!.minutes).toBe(540);
  });

  it("rounding applies to registrations without a planned shift", () => {
    const r = pay([shift("2026-01-05 08:00", "2026-01-05 15:24")], "2026-01-05", "2026-01-05");
    expect(r.dailyMinutes).toEqual({ "2026-01-05": 450 });
  });

  it("only includes segments inside the pay period", () => {
    const r = pay([shift("2026-01-05 22:00", "2026-01-06 02:00")], "2026-01-06", "2026-01-06");
    expect(sums(r)).toEqual({
      NORMAL: { minutes: 120, amount: 30000 },
      NAT: { minutes: 120, amount: 9000 },
    });
  });
});

describe("calculatePay – overtime", () => {
  const week = ["05", "06", "07", "08", "09"].map((d) =>
    shift(`2026-01-${d} 08:00`, `2026-01-${d} 16:00`),
  );

  it("minutes beyond the weekly norm become overtime in tiers", () => {
    const r = pay(
      [...week, shift("2026-01-10 10:00", "2026-01-10 12:00")],
      "2026-01-05",
      "2026-01-11",
    );
    expect(sums(r)).toEqual({
      NORMAL: { minutes: 2520, amount: 630000 },
      OT50: { minutes: 180, amount: 22500 },
      OT100: { minutes: 120, amount: 30000 },
    });
  });

  it("exactly the norm gives no overtime", () => {
    // Rounding to quarters would turn 15:24 into 15:30, so it is removed here.
    const r = pay(
      ["05", "06", "07", "08", "09"].map((d) => shift(`2026-01-${d} 08:00`, `2026-01-${d} 15:24`)),
      "2026-01-05",
      "2026-01-11",
      {
        overrides: [{ id: "afrunding", remove: true }],
      },
    );
    expect(Object.keys(sums(r))).toEqual(["NORMAL"]);
  });

  it("monthly paid staff get no hourly line, overtime includes the base", () => {
    const r = pay(
      [...week, shift("2026-01-10 10:00", "2026-01-10 12:00")],
      "2026-01-05",
      "2026-01-11",
      { contract: { payForm: "monthly" } },
    );
    expect(sums(r)).toEqual({
      OT50: { minutes: 180, amount: 67500 },
      OT100: { minutes: 120, amount: 60000 },
    });
  });

  it("overtime as time off gives a time-off balance instead of money", () => {
    const r = pay([...week], "2026-01-05", "2026-01-11", {
      overrides: [{ id: "ot", params: { compensation: "time_off", time_off_factor_bp: 15000 } }],
    });
    const ot = r.lines.find((l) => l.payCode === "OT50")!;
    expect(ot).toMatchObject({ unit: "time_off_minutes", quantityMinutes: 270, amountOre: 0 });
  });

  it("a contract change mid-week prorates the norm per day", () => {
    const c1: ContractFacts = {
      id: "c1",
      validFrom: "2020-01-01",
      validTo: "2026-01-07",
      agreementId: "pay-test",
      localAgreementId: null,
      overrides: null,
      payForm: "hourly",
      weeklyNormMinutes: 2220,
      staffGroup: null,
      payStep: null,
    };
    const c2: ContractFacts = {
      ...c1,
      id: "c2",
      validFrom: "2026-01-08",
      validTo: null,
      weeklyNormMinutes: 1200,
    };
    const days = ["05", "06", "07", "08", "09"].map((d) =>
      shift(`2026-01-${d} 08:00`, `2026-01-${d} 14:00`),
    );
    const r = pay(days, "2026-01-05", "2026-01-11", { contracts: [c1, c2] });
    // Norm = 2220·3/7 + 1200·4/7 = 1637 min; worked 1800 → 163 overtime.
    expect(sums(r).OT50).toEqual({ minutes: 163, amount: 20375 });
  });

  it("absence that counts towards the norm reduces the remaining norm", () => {
    const days = ["06", "07", "08", "09"].map((d) =>
      shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:00`),
    );
    const r = pay(
      days,
      "2026-01-05",
      "2026-01-11",
      {},
      { absences: [{ id: "a1", type: "sick", from: "2026-01-05", to: "2026-01-05" }] },
    );
    expect(sums(r)).toEqual({
      NORMAL: { minutes: 2160, amount: 540000 },
      SYG: { minutes: 444, amount: 111000 },
      OT50: { minutes: 180, amount: 22500 },
      OT100: { minutes: 204, amount: 51000 },
    });
  });
});

describe("calculatePay – stacking", () => {
  // Mon–Thu 9 h = 2160, Friday 18–20: first 60 min normal, last 60 min overtime – all evening.
  const shifts = () => [
    ...["05", "06", "07", "08"].map((d) => shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:00`)),
    shift("2026-01-09 18:00", "2026-01-09 20:00"),
  ];

  it("additive overtime and highest-in-group evening are both paid", () => {
    const s = sums(pay(shifts(), "2026-01-05", "2026-01-11"));
    expect(s.OT50).toEqual({ minutes: 60, amount: 7500 });
    expect(s.AFTEN).toEqual({ minutes: 120, amount: 6000 });
  });

  it("exclusive overtime suppresses the evening supplement on overtime minutes", () => {
    const s = sums(
      pay(shifts(), "2026-01-05", "2026-01-11", {
        overrides: [{ id: "ot", stacking: { mode: "exclusive" } }],
      }),
    );
    expect(s.OT50).toEqual({ minutes: 60, amount: 7500 });
    expect(s.AFTEN).toEqual({ minutes: 60, amount: 3000 });
  });

  it("highest in the same group: Sunday 50 % beats night supplement", () => {
    const s = sums(
      pay([shift("2026-01-11 00:00", "2026-01-11 02:00")], "2026-01-11", "2026-01-11"),
    );
    expect(s.SOEN).toEqual({ minutes: 120, amount: 15000 });
    expect(s.NAT).toBeUndefined();
  });

  it("replaces removes the named rule and keeps both additive otherwise", () => {
    const s = sums(
      pay(
        [
          shift("2026-01-11 00:00", "2026-01-11 02:00"),
          shift("2026-01-12 00:00", "2026-01-12 01:00"),
        ],
        "2026-01-11",
        "2026-01-12",
        {
          overrides: [
            { id: "nat", stacking: { mode: "additive", group: null } },
            { id: "soen", stacking: { mode: "additive", group: null, replaces: ["nat"] } },
          ],
        },
      ),
    );
    expect(s.SOEN!.minutes).toBe(120);
    expect(s.NAT!.minutes).toBe(60); // only Monday night
  });

  it("a holiday on a Sunday is paid once", () => {
    const s = sums(
      pay([shift("2026-04-05 10:00", "2026-04-05 12:00")], "2026-04-05", "2026-04-05"),
    );
    expect(s.SOEN).toEqual({ minutes: 120, amount: 15000 });
  });

  it("half holidays apply from the given time", () => {
    const s = sums(
      pay([shift("2026-06-05 10:00", "2026-06-05 14:00")], "2026-06-05", "2026-06-05", {
        overrides: [
          {
            id: "helligdage",
            params: {
              holidays: ["grundlovsdag"],
              partial: [{ key: "grundlovsdag", from: "12:00" }],
            },
          },
        ],
      }),
    );
    expect(s.SOEN).toEqual({ minutes: 120, amount: 15000 });
  });
});

describe("calculatePay – rates, rounding, guarantees, on-call", () => {
  it("youth rate stops on the 18th birthday", () => {
    const r = pay(
      [
        shift("2026-01-06 08:00", "2026-01-06 12:00"),
        shift("2026-01-07 08:00", "2026-01-07 12:00"),
      ],
      "2026-01-06",
      "2026-01-07",
      { birthDate: "2008-01-07" },
    );
    expect(
      r.lines.filter((l) => l.payCode === "NORMAL").map((l) => [l.quantityMinutes, l.rateOre]),
    ).toEqual([
      [240, 9000],
      [240, 15000],
    ]);
  });

  it("snaps to the planned shift within tolerance, otherwise rounds to quarters", () => {
    const planned = [
      shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "p1" }),
      shift("2026-01-06 08:00", "2026-01-06 16:00", { id: "p2" }),
    ];
    const r = pay(
      [
        shift("2026-01-05 07:53", "2026-01-05 16:08", { plannedShiftId: "p1" }),
        shift("2026-01-06 07:40", "2026-01-06 16:20", { plannedShiftId: "p2" }),
      ],
      "2026-01-05",
      "2026-01-06",
      {},
      { planned },
    );
    expect(r.dailyMinutes).toEqual({ "2026-01-05": 480, "2026-01-06": 510 });
  });

  it("pays a minimum-shift guarantee when sent home early", () => {
    const planned = [shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "p3" })];
    const r = pay(
      [shift("2026-01-05 08:00", "2026-01-05 10:00", { plannedShiftId: "p3" })],
      "2026-01-05",
      "2026-01-05",
      {},
      { planned },
    );
    expect(sums(r).GARANTI).toEqual({ minutes: 60, amount: 15000 });
  });

  it("on-call pays per hour, call-out is work with a minimum guarantee", () => {
    const r = pay(
      [
        shift("2026-01-06 18:00", "2026-01-07 02:00", { kind: "on_call" }),
        shift("2026-01-06 20:00", "2026-01-06 20:30", { kind: "call_out" }),
      ],
      "2026-01-06",
      "2026-01-07",
    );
    expect(sums(r)).toEqual({
      RAADIGHED: { minutes: 450, amount: 15000 },
      NORMAL: { minutes: 30, amount: 7500 },
      AFTEN: { minutes: 30, amount: 1500 },
      TILKALD_GARANTI: { minutes: 150, amount: 37500 },
    });
  });
});

describe("calculatePay – explanations", () => {
  it("every line explains which rule, layer and intervals it came from", () => {
    const r = pay(
      [shift("2026-01-05 16:00", "2026-01-05 20:00", { id: "x1" })],
      "2026-01-05",
      "2026-01-05",
    );
    const aften = r.lines.find((l) => l.payCode === "AFTEN")!;
    expect(aften.explanation).toMatchObject({
      ruleId: "aften",
      primitive: "time_window_supplement",
      source: "§4",
      layer: { agreementId: "pay-test", version: 1 },
    });
    expect(aften.explanation.intervals).toEqual([
      {
        intervalId: "x1",
        date: "2026-01-05",
        start: "2026-01-05T17:00:00Z",
        end: "2026-01-05T19:00:00Z",
        minutes: 120,
      },
    ]);
  });
});
