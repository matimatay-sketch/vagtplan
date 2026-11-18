import { describe, expect, it } from "vitest";
import { expenseLines, formatKm, mileageLines, parseKm, type MileageRate } from "./mileage";

// Test rates (not real ones): 1,00 kr./km up to 1.000 km a year, then 0,50 kr./km.
const rate2027: MileageRate = {
  year: 2027,
  highRateOre: 100,
  lowRateOre: 50,
  highLimitKm: 1000,
  payCodeHigh: "KM_HOEJ",
  payCodeLow: "KM_LAV",
  source: "Test",
};
const trip = (id: string, date: string, meters: number, posting: Record<string, string> = {}) => ({
  id,
  date,
  meters,
  posting,
});
const view = (r: ReturnType<typeof mileageLines>) =>
  r.lines.map((l) => [l.payCode, l.quantityMinutes, l.rateOre, l.amountOre]);

describe("mileageLines", () => {
  it("pays the high rate below the yearly limit", () => {
    const r = mileageLines([trip("a", "2027-03-02", 42_500)], {}, [rate2027]);
    expect(view(r)).toEqual([["KM_HOEJ", 42_500, 100, 4250]]);
    expect(r.lines[0]!.unit).toBe("km");
    expect(r.missingYears).toEqual([]);
  });

  it("splits the trip that crosses the limit, counting km driven earlier in the year", () => {
    // 990 km already this year; a 25 km trip: 10 km high, 15 km low.
    const r = mileageLines([trip("a", "2027-11-02", 25_000)], { 2027: 990_000 }, [rate2027]);
    expect(view(r)).toEqual([
      ["KM_HOEJ", 10_000, 100, 1000],
      ["KM_LAV", 15_000, 50, 750],
    ]);
  });

  it("counts trips in date order, and above the limit only the low rate applies", () => {
    const r = mileageLines(
      [trip("b", "2027-11-03", 5_000), trip("a", "2027-11-02", 20_000)],
      { 2027: 990_000 },
      [rate2027],
    );
    expect(view(r)).toEqual([
      ["KM_HOEJ", 10_000, 100, 1000],
      ["KM_LAV", 15_000, 50, 750],
    ]);
  });

  it("rounds the amount once per line (metres × øre/km)", () => {
    // 3 trips of 333 m at 1,00 kr./km = 999 m → 99,9 øre → 100 øre.
    const r = mileageLines(
      ["a", "b", "c"].map((id) => trip(id, "2027-01-05", 333)),
      {},
      [rate2027],
    );
    expect(view(r)).toEqual([["KM_HOEJ", 999, 100, 100]]);
  });

  it("each year has its own limit and rates; a year without rates is reported", () => {
    const r = mileageLines(
      [trip("a", "2026-12-31", 1_000), trip("b", "2027-01-01", 1_000)],
      { 2026: 5_000_000 },
      [rate2027],
    );
    expect(view(r)).toEqual([["KM_HOEJ", 1_000, 100, 100]]);
    expect(r.missingYears).toEqual([2026]);
  });

  it("keeps postings apart", () => {
    const r = mileageLines(
      [
        trip("a", "2027-01-05", 1_000, { cc: "1100" }),
        trip("b", "2027-01-06", 2_000, { cc: "1200" }),
      ],
      {},
      [rate2027],
    );
    expect(r.lines.map((l) => [l.posting.cc, l.quantityMinutes])).toEqual([
      ["1100", 1_000],
      ["1200", 2_000],
    ]);
  });
});

describe("expenseLines", () => {
  it("sums expenses per category and posting as fixed amounts", () => {
    const lines = expenseLines([
      { id: "a", payCode: "UDLAEG_P", label: "Parkering", amountOre: 4500, posting: {} },
      { id: "b", payCode: "UDLAEG_P", label: "Parkering", amountOre: 1250, posting: {} },
      { id: "c", payCode: "UDLAEG_B", label: "Bro", amountOre: 24000, posting: {} },
    ]);
    expect(
      lines.map((l) => [l.payCode, l.unit, l.quantityMinutes, l.rateOre, l.amountOre]),
    ).toEqual([
      ["UDLAEG_B", "fixed", 0, 0, 24000],
      ["UDLAEG_P", "fixed", 0, 0, 5750],
    ]);
  });
});

describe("km input and display", () => {
  it("parses Danish decimals to metres and formats metres as km", () => {
    expect(parseKm("42,5")).toBe(42_500);
    expect(parseKm("1.234,56")).toBe(1_234_560);
    expect(parseKm("12")).toBe(12_000);
    expect(parseKm("0")).toBeNull();
    expect(parseKm("abc")).toBeNull();
    expect(formatKm(42_500)).toBe("42,5 km");
    expect(formatKm(1_234_560)).toBe("1.234,56 km");
  });
});
