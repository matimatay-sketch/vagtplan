import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { calculatePay, type PayLine } from "./index";
import { cph, makeInput, shift } from "../../test/support";

/** Base rate and an evening supplement (test values). */
const doc = (hourlyOre = 15000) =>
  parseAgreementDocument({
    id: "posting-test",
    name: "Kontering",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules: [
      {
        id: "sats",
        primitive: "pay_rate",
        source: "§1",
        params: { pay_code: "NORMAL", rates: [{ hourly_ore: hourlyOre }] },
      },
      {
        id: "aften",
        primitive: "time_window_supplement",
        source: "§2",
        params: {
          windows: [{ days: ["any"], from: "18:00", to: "24:00" }],
          amount: { type: "ore_per_hour", ore: 3000 },
          pay_code: "AFTEN",
        },
      },
    ],
  });

type Row = {
  values: Record<string, string>;
  start: string | null;
  end: string | null;
  minutes: number | null;
};
const rest = (values: Record<string, string>): Row => ({
  values,
  start: null,
  end: null,
  minutes: null,
});
const mins = (values: Record<string, string>, minutes: number): Row => ({
  values,
  start: null,
  end: null,
  minutes,
});
const span = (values: Record<string, string>, from: string, to: string): Row => ({
  values,
  start: cph(from),
  end: cph(to),
  minutes: null,
});

function pay(worked: (ReturnType<typeof shift> & { postings?: Row[] })[], hourlyOre?: number) {
  return calculatePay({
    ...makeInput({ extraDocs: [doc(hourlyOre)], agreementId: "posting-test" }),
    period: { from: "2026-01-01", to: "2026-01-31" },
    worked,
  });
}
const view = (lines: PayLine[]) =>
  lines.map((l) => [l.payCode, l.posting.cc ?? "-", l.quantityMinutes, l.amountOre]);

describe("pay lines split by posting", () => {
  it("without postings every line has an empty posting and is unchanged", () => {
    const r = pay([shift("2026-01-06 08:00", "2026-01-06 16:00")]);
    expect(r.lines.map((l) => [l.payCode, l.posting, l.quantityMinutes, l.amountOre])).toEqual([
      ["NORMAL", {}, 480, 120000],
    ]);
  });

  it("a whole shift on one cost centre", () => {
    const s = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00"),
      postings: [rest({ cc: "1100" })],
    };
    expect(view(pay([s]).lines)).toEqual([["NORMAL", "1100", 480, 120000]]);
  });

  it("a time span is posted exactly; supplements follow the time", () => {
    const s = {
      ...shift("2026-01-06 14:00", "2026-01-06 22:00"),
      postings: [
        span({ cc: "1100" }, "2026-01-06 14:00", "2026-01-06 18:00"),
        rest({ cc: "1200" }),
      ],
    };
    expect(view(pay([s]).lines)).toEqual([
      ["AFTEN", "1200", 240, 12000],
      ["NORMAL", "1100", 240, 60000],
      ["NORMAL", "1200", 240, 60000],
    ]);
  });

  it("minutes rows share every line pro rata (supplements too)", () => {
    const s = {
      ...shift("2026-01-06 14:00", "2026-01-06 22:00"),
      postings: [mins({ cc: "1100" }, 180), rest({ cc: "1200" })],
    };
    // AFTEN 240 min split 180 : 300 → 90 : 150.
    expect(view(pay([s]).lines)).toEqual([
      ["AFTEN", "1100", 90, 4500],
      ["AFTEN", "1200", 150, 7500],
      ["NORMAL", "1100", 180, 45000],
      ["NORMAL", "1200", 300, 75000],
    ]);
  });

  it("minutes not covered by any row stay without posting", () => {
    const s = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00"),
      postings: [mins({ cc: "1100" }, 180)],
    };
    expect(view(pay([s]).lines)).toEqual([
      ["NORMAL", "1100", 180, 45000],
      ["NORMAL", "-", 300, 75000],
    ]);
  });

  it("amounts are split so the total is exactly the unsplit amount", () => {
    // 480 min at 10,01 kr. = 8.008 øre; split 100 : 100 : 280.
    const s = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00"),
      postings: [mins({ cc: "A" }, 100), mins({ cc: "B" }, 100), rest({ cc: "C" })],
    };
    const lines = pay([s], 1001).lines;
    expect(lines.map((l) => [l.posting.cc, l.quantityMinutes])).toEqual([
      ["A", 100],
      ["B", 100],
      ["C", 280],
    ]);
    expect(lines.reduce((t, l) => t + l.amountOre, 0)).toBe(8008);
  });

  it("unpaid breaks inside a span are not posted", () => {
    const s = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00", {
        breaks: [["2026-01-06 10:00", "2026-01-06 10:30"]],
      }),
      postings: [
        span({ cc: "1100" }, "2026-01-06 08:00", "2026-01-06 12:00"),
        rest({ cc: "1200" }),
      ],
    };
    expect(view(pay([s]).lines)).toEqual([
      ["NORMAL", "1100", 210, 52500],
      ["NORMAL", "1200", 240, 60000],
    ]);
  });

  it("several dimensions form one posting", () => {
    const s = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00"),
      postings: [rest({ cc: "1100", projekt: "P-7" })],
    };
    expect(pay([s]).lines.map((l) => l.posting)).toEqual([{ cc: "1100", projekt: "P-7" }]);
  });

  it("lines from several shifts with the same posting are summed", () => {
    const a = {
      ...shift("2026-01-06 08:00", "2026-01-06 16:00"),
      postings: [rest({ cc: "1100" })],
    };
    const b = {
      ...shift("2026-01-07 08:00", "2026-01-07 16:00"),
      postings: [rest({ cc: "1100" })],
    };
    expect(view(pay([a, b]).lines)).toEqual([["NORMAL", "1100", 960, 240000]]);
  });
});
