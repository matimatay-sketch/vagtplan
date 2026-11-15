import { describe, expect, it } from "vitest";
import { ageOn, isYoungWorker } from "./age";

describe("ageOn", () => {
  it("counts completed years", () => {
    expect(ageOn("2010-05-20", "2026-05-19")).toBe(15);
    expect(ageOn("2010-05-20", "2026-05-20")).toBe(16);
    expect(ageOn("2010-05-20", "2026-12-31")).toBe(16);
  });

  it("treats 29 February birthdays as 1 March in non-leap years", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
    expect(ageOn("2008-02-29", "2028-02-29")).toBe(20);
  });
});

describe("isYoungWorker", () => {
  it("is true until the 18th birthday", () => {
    expect(isYoungWorker("2008-11-13", "2026-11-12")).toBe(true);
    expect(isYoungWorker("2008-11-12", "2026-11-12")).toBe(false);
  });
});
