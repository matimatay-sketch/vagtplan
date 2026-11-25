import { describe, expect, it } from "vitest";
import { reminderFromBody, reminderRuleSchema } from "./reminders";

const butik = "30000000-0000-0000-0000-000000000001";
const mads = "50000000-0000-0000-0000-000000000002";

describe("reminderRuleSchema", () => {
  it("reads the form: kind, departments, employees, auto and weekdays", () => {
    const fd = new FormData();
    fd.set("name", " Husk at registrere ");
    fd.set("kind", "missing_registration");
    fd.append("department_ids", butik);
    fd.append("employee_ids", mads);
    fd.set("lookback_days", "14");
    fd.set("note", "Husk det");
    fd.set("auto", "on");
    fd.append("weekdays", "1");
    fd.append("weekdays", "5");
    expect(reminderRuleSchema.parse(fd)).toEqual({
      name: "Husk at registrere",
      kind: "missing_registration",
      department_ids: [butik],
      employee_ids: [mads],
      lookback_days: 14,
      note: "Husk det",
      auto: true,
      weekdays: [1, 5],
      frequency: "weekly",
      day_of_month: 1,
      month: 1,
    });
  });

  it("repeats monthly, quarterly or yearly on a day of the month", () => {
    const fd = new FormData();
    fd.set("name", "Kvartal");
    fd.set("kind", "time_approval");
    fd.set("lookback_days", "93");
    fd.set("auto", "on");
    fd.set("frequency", "quarterly");
    fd.set("day_of_month", "31");
    fd.set("month", "3");
    expect(reminderRuleSchema.parse(fd)).toMatchObject({
      frequency: "quarterly",
      day_of_month: 31,
      month: 3,
      weekdays: [],
    });
    fd.set("month", "4");
    expect(reminderRuleSchema.safeParse(fd).error?.issues[0]?.path).toEqual(["month"]);
    fd.set("frequency", "yearly");
    fd.set("day_of_month", "32");
    expect(reminderRuleSchema.safeParse(fd).error?.issues[0]?.path).toEqual(["day_of_month"]);
  });

  it("empty lists mean everyone; auto off without weekdays is fine", () => {
    const fd = new FormData();
    fd.set("name", "Godkend tid");
    fd.set("kind", "time_approval");
    fd.set("lookback_days", "7");
    expect(reminderRuleSchema.parse(fd)).toMatchObject({
      department_ids: [],
      employee_ids: [],
      auto: false,
      weekdays: [],
      note: "",
    });
  });

  it("automatic sending needs a weekday; the period is 1–93 days", () => {
    const fd = new FormData();
    fd.set("name", "X");
    fd.set("kind", "open_stamp");
    fd.set("lookback_days", "0");
    fd.set("auto", "on");
    const r = reminderRuleSchema.safeParse(fd);
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["lookback_days", "weekdays"]),
    );
  });
});

describe("reminderFromBody", () => {
  it("reads a reminder message", () => {
    expect(reminderFromBody('{"kind":"missing_registration","count":3,"note":"Husk det"}')).toEqual(
      { kind: "missing_registration", count: 3, note: "Husk det" },
    );
  });
  it("is null for anything else", () => {
    expect(reminderFromBody("accepted")).toBeNull();
    expect(reminderFromBody('{"kind":"bogus","count":1}')).toBeNull();
  });
});
