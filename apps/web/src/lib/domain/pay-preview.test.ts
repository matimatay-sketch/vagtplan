import { describe, expect, it } from "vitest";
import { previewFromLines, type PreviewLine } from "./pay-preview";

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  payCode: "NORMAL",
  label: "Timeløn",
  unit: "hours",
  quantityMinutes: 0,
  amountOre: 0,
  intervals: [],
  ...over,
});

describe("previewFromLines", () => {
  it("sums each pay code for the week and splits it per registration", () => {
    const p = previewFromLines([
      line({
        quantityMinutes: 450,
        amountOre: 112500,
        intervals: [
          { intervalId: "a", minutes: 240 },
          { intervalId: "b", minutes: 210 },
        ],
      }),
      line({
        payCode: "AFTEN",
        label: "Aftentillæg",
        quantityMinutes: 120,
        amountOre: 6000,
        intervals: [{ intervalId: "b", minutes: 120 }],
      }),
      // A second NORMAL line (another rate) adds up.
      line({
        quantityMinutes: 60,
        amountOre: 10000,
        intervals: [{ intervalId: "a", minutes: 60 }],
      }),
    ]);
    expect(p.codes).toEqual([
      { payCode: "AFTEN", label: "Aftentillæg", unit: "hours", minutes: 120, amountOre: 6000 },
      { payCode: "NORMAL", label: "Timeløn", unit: "hours", minutes: 510, amountOre: 122500 },
    ]);
    expect(p.byEntry).toEqual({
      a: [{ payCode: "NORMAL", minutes: 300 }],
      b: [
        { payCode: "AFTEN", minutes: 120 },
        { payCode: "NORMAL", minutes: 210 },
      ],
    });
  });

  it("fixed supplements count once per registration without minutes", () => {
    const p = previewFromLines([
      line({
        payCode: "FAST",
        label: "Fast tillæg",
        unit: "fixed",
        amountOre: 5000,
        intervals: [{ intervalId: "a", minutes: 0 }],
      }),
    ]);
    expect(p.codes).toEqual([
      { payCode: "FAST", label: "Fast tillæg", unit: "fixed", minutes: 0, amountOre: 5000 },
    ]);
    expect(p.byEntry).toEqual({ a: [{ payCode: "FAST", minutes: 0 }] });
  });
});
