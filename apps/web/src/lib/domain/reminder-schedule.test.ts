import { describe, expect, it } from "vitest";
import { isReminderDue, nextReminderDate, type ReminderSchedule } from "./reminder-schedule";

const weekly: ReminderSchedule = { frequency: "weekly", weekdays: [1, 3], dayOfMonth: 1, month: 1 };
const monthly = (day: number): ReminderSchedule => ({
  frequency: "monthly",
  weekdays: [],
  dayOfMonth: day,
  month: 1,
});

describe("isReminderDue", () => {
  it("weekly: on the chosen weekdays", () => {
    expect(isReminderDue(weekly, "2026-11-23")).toBe(true); // Monday
    expect(isReminderDue(weekly, "2026-11-24")).toBe(false); // Tuesday
    expect(isReminderDue(weekly, "2026-11-25")).toBe(true); // Wednesday
  });

  it("monthly: on the day of the month, or the last day of a shorter month", () => {
    expect(isReminderDue(monthly(15), "2026-11-15")).toBe(true);
    expect(isReminderDue(monthly(15), "2026-11-16")).toBe(false);
    expect(isReminderDue(monthly(31), "2026-11-30")).toBe(true);
    expect(isReminderDue(monthly(31), "2026-12-30")).toBe(false);
    expect(isReminderDue(monthly(31), "2026-12-31")).toBe(true);
    expect(isReminderDue(monthly(30), "2027-02-28")).toBe(true); // not a leap year
    expect(isReminderDue(monthly(30), "2028-02-28")).toBe(false); // leap year
    expect(isReminderDue(monthly(30), "2028-02-29")).toBe(true);
  });

  it("quarterly: the day in the chosen month of each quarter", () => {
    const q: ReminderSchedule = { frequency: "quarterly", weekdays: [], dayOfMonth: 5, month: 1 };
    expect(
      ["2027-01-05", "2027-04-05", "2027-07-05", "2027-10-05"].map((d) => isReminderDue(q, d)),
    ).toEqual([true, true, true, true]);
    expect(isReminderDue(q, "2027-02-05")).toBe(false);
    const last: ReminderSchedule = {
      frequency: "quarterly",
      weekdays: [],
      dayOfMonth: 31,
      month: 3,
    };
    expect(isReminderDue(last, "2027-03-31")).toBe(true);
    expect(isReminderDue(last, "2027-06-30")).toBe(true);
    expect(isReminderDue(last, "2027-05-31")).toBe(false);
  });

  it("yearly: the day in the chosen month", () => {
    const y: ReminderSchedule = { frequency: "yearly", weekdays: [], dayOfMonth: 29, month: 2 };
    expect(isReminderDue(y, "2027-02-28")).toBe(true);
    expect(isReminderDue(y, "2028-02-28")).toBe(false);
    expect(isReminderDue(y, "2028-02-29")).toBe(true);
    expect(isReminderDue(y, "2028-03-29")).toBe(false);
  });
});

describe("nextReminderDate", () => {
  it("is the first due day from the given date (that day included)", () => {
    expect(nextReminderDate(weekly, "2026-11-24")).toBe("2026-11-25");
    expect(nextReminderDate(weekly, "2026-11-25")).toBe("2026-11-25");
    expect(nextReminderDate(monthly(31), "2026-12-01")).toBe("2026-12-31");
    expect(
      nextReminderDate(
        { frequency: "yearly", weekdays: [], dayOfMonth: 1, month: 1 },
        "2026-11-25",
      ),
    ).toBe("2027-01-01");
  });

  it("is null for a weekly rule without weekdays", () => {
    expect(nextReminderDate({ ...weekly, weekdays: [] }, "2026-11-25")).toBeNull();
  });
});
