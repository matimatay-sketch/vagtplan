import { describe, expect, it } from "vitest";
import { previewFromLines, sumPreviews, type PreviewLine } from "./pay-preview";

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  payCode: "NORMAL",
  label: "Timeløn",
  unit: "hours",
  quantityMinutes: 0,
  amountOre: 0,
  why: { ruleId: "loensats", source: "§ 1", layer: "eksempel v1", note: null },
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
    expect(p.codes.map(({ why: _w, intervals: _i, ...c }) => c)).toEqual([
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
    expect(p.codes.map(({ why: _w, intervals: _i, ...c }) => c)).toEqual([
      { payCode: "FAST", label: "Fast tillæg", unit: "fixed", minutes: 0, amountOre: 5000 },
    ]);
    expect(p.byEntry).toEqual({ a: [{ payCode: "FAST", minutes: 0 }] });
  });
});

describe("explanations and department totals", () => {
  it("keeps why each pay code was activated (rule, source, layer), once per rule", () => {
    const why = { ruleId: "aftentillaeg", source: "§ 4", layer: "eksempel-detail v1", note: null };
    const p = previewFromLines([
      line({
        payCode: "AFTEN",
        quantityMinutes: 60,
        why,
        intervals: [{ intervalId: "a", minutes: 60, start: "s1", end: "e1" }],
      }),
      line({
        payCode: "AFTEN",
        quantityMinutes: 30,
        why,
        intervals: [{ intervalId: "b", minutes: 30, start: "s2", end: "e2" }],
      }),
    ]);
    expect(p.codes[0]!.why).toEqual([why]);
    expect(p.codes[0]!.intervals).toEqual([
      { start: "s1", end: "e1", minutes: 60 },
      { start: "s2", end: "e2", minutes: 30 },
    ]);
  });

  it("sums several employees into a department total", () => {
    const a = previewFromLines([line({ quantityMinutes: 450, amountOre: 112500 })]);
    const b = previewFromLines([
      line({ quantityMinutes: 240, amountOre: 60000 }),
      line({ payCode: "AFTEN", label: "Aftentillæg", quantityMinutes: 60, amountOre: 3000 }),
    ]);
    expect(sumPreviews([a, b])).toEqual([
      { payCode: "AFTEN", label: "Aftentillæg", unit: "hours", minutes: 60, amountOre: 3000 },
      { payCode: "NORMAL", label: "Timeløn", unit: "hours", minutes: 690, amountOre: 172500 },
    ]);
  });
});
