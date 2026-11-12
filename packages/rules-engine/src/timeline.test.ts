import { describe, expect, it } from "vitest";
import { cutSpan, freeGaps, mergeSpans, normalizeIntervals, workPieces } from "./timeline";

const T = (h: number, m = 0) => Date.UTC(2026, 0, 5, h, m);

describe("timeline", () => {
  it("normalizes, sorts and clips breaks", () => {
    const [i] = normalizeIntervals([
      {
        id: "a",
        start: "2026-01-05T08:00:00Z",
        end: "2026-01-05T16:00:00Z",
        breaks: [{ start: "2026-01-05T12:00:00Z", end: "2026-01-05T12:30:00Z" }],
      },
    ]);
    expect(workPieces(i!)).toEqual([
      { start: T(8), end: T(12) },
      { start: T(12, 30), end: T(16) },
    ]);
  });

  it("rejects intervals that end before they start", () => {
    expect(() =>
      normalizeIntervals([{ id: "x", start: "2026-01-05T08:00:00Z", end: "2026-01-05T08:00:00Z" }]),
    ).toThrow();
  });

  it("merges touching spans and finds free gaps", () => {
    const blocks = mergeSpans([
      { start: T(8), end: T(12) },
      { start: T(12), end: T(14) },
      { start: T(18), end: T(20) },
    ]);
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      [T(8), T(14)],
      [T(18), T(20)],
    ]);
    expect(freeGaps(blocks, { start: T(6), end: T(22) })).toEqual([
      { start: T(6), end: T(8) },
      { start: T(14), end: T(18) },
      { start: T(20), end: T(22) },
    ]);
  });

  it("cuts spans at instants inside them only", () => {
    expect(cutSpan({ start: T(8), end: T(12) }, [T(6), T(10), T(12), T(10)])).toEqual([
      { start: T(8), end: T(10) },
      { start: T(10), end: T(12) },
    ]);
  });
});
