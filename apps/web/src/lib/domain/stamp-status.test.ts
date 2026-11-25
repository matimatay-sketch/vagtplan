import { describe, expect, it } from "vitest";
import { stampStatus } from "./stamp-status";

const plan = { start: "2026-12-07T07:00:00Z", end: "2026-12-07T15:00:00Z" };
const at = (iso: string) => Date.parse(iso);

describe("stampStatus", () => {
  it("is upcoming before the start, and late a few minutes after it without a stamp", () => {
    expect(stampStatus(plan, null, at("2026-12-07T06:50:00Z"))).toBe("upcoming");
    expect(stampStatus(plan, null, at("2026-12-07T07:05:00Z"))).toBe("upcoming");
    expect(stampStatus(plan, null, at("2026-12-07T07:06:00Z"))).toBe("late");
  });

  it("is in while stamped in, and not stamped out a while after the end", () => {
    const open = { start: "2026-12-07T06:58:00Z", end: null };
    expect(stampStatus(plan, open, at("2026-12-07T12:00:00Z"))).toBe("in");
    expect(stampStatus(plan, open, at("2026-12-07T15:15:00Z"))).toBe("in");
    expect(stampStatus(plan, open, at("2026-12-07T15:16:00Z"))).toBe("not_out");
  });

  it("is done once stamped out, and missing when the shift ended without any stamp", () => {
    const closed = { start: "2026-12-07T06:58:00Z", end: "2026-12-07T15:02:00Z" };
    expect(stampStatus(plan, closed, at("2026-12-07T16:00:00Z"))).toBe("done");
    expect(stampStatus(plan, null, at("2026-12-07T15:00:00Z"))).toBe("missing");
  });
});
