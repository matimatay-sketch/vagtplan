import { describe, expect, it } from "vitest";
import { timeEntryFormSchema } from "./time";

const base = {
  date: "2026-11-10",
  start_time: "08:00",
  end_time: "16:00",
  breaks: JSON.stringify([{ start: "", minutes: 30, paid: false }]),
};

describe("timeEntryFormSchema", () => {
  it("parses a registration with breaks and optional fields", () => {
    const r = timeEntryFormSchema.parse({ ...base, deviation_reason: "  Kom tidligt ", note: "" });
    expect(r).toMatchObject({
      id: null,
      employee_id: null,
      shift_id: null,
      endsNextDay: false,
      deviation_reason: "Kom tidligt",
      note: null,
      breaks: [{ start: null, minutes: 30, paid: false, nextDay: false }],
    });
  });
  it("a night registration ends the next day", () => {
    expect(
      timeEntryFormSchema.parse({ ...base, start_time: "22:00", end_time: "06:00" }).endsNextDay,
    ).toBe(true);
  });
  it("rejects equal times and breaks longer than the registration", () => {
    const same = timeEntryFormSchema.safeParse({ ...base, end_time: "08:00" });
    expect(same.error!.issues[0]!.path).toEqual(["end_time"]);
    const long = timeEntryFormSchema.safeParse({
      ...base,
      end_time: "08:20",
      breaks: JSON.stringify([{ start: "", minutes: 30, paid: false }]),
    });
    expect(long.error!.issues[0]!.path).toEqual(["breaks"]);
  });
  it("limits the reason to 500 characters", () => {
    expect(
      timeEntryFormSchema.safeParse({ ...base, deviation_reason: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
