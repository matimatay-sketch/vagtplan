import { describe, expect, it } from "vitest";
import { availabilitySchema } from "./availability";

describe("availabilitySchema", () => {
  const base = { date: "2026-12-08", kind: "wish_off", from_time: "", to_time: "", note: "" };
  it("whole day when no times are given", () => {
    expect(availabilitySchema("2026-11-12").parse(base)).toEqual({
      date: "2026-12-08",
      kind: "wish_off",
      from_time: null,
      to_time: null,
      note: null,
    });
  });
  it("requires both times and from < to", () => {
    expect(
      availabilitySchema("2026-11-12").safeParse({ ...base, from_time: "08:00" }).success,
    ).toBe(false);
    expect(
      availabilitySchema("2026-11-12").safeParse({ ...base, from_time: "16:00", to_time: "08:00" })
        .success,
    ).toBe(false);
    expect(
      availabilitySchema("2026-11-12").parse({ ...base, from_time: "08:00", to_time: "12:00" }),
    ).toMatchObject({ from_time: "08:00", to_time: "12:00" });
  });
  it("rejects dates in the past", () => {
    expect(
      availabilitySchema("2026-11-12").safeParse({ ...base, date: "2026-11-11" }).success,
    ).toBe(false);
  });
});
