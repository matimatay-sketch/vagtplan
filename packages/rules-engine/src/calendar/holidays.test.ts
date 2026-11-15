import { describe, expect, it } from "vitest";
import { buildHolidayCalendar, easterSunday } from "./holidays";

describe("easterSunday", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2030, "2030-04-21"],
  ])("Easter %i is %s", (year, date) => {
    expect(easterSunday(year)).toBe(date);
  });
});

describe("buildHolidayCalendar", () => {
  const legal = [
    "nytaarsdag",
    "skaertorsdag",
    "langfredag",
    "paaskedag",
    "anden_paaskedag",
    "kristi_himmelfartsdag",
    "pinsedag",
    "anden_pinsedag",
    "juledag",
    "anden_juledag",
  ];

  it("computes the Easter-dependent holidays for 2026", () => {
    const cal = buildHolidayCalendar({ holidays: legal }, [2026]);
    expect([...cal.keys()]).toEqual([
      "2026-01-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-05",
      "2026-04-06",
      "2026-05-14",
      "2026-05-24",
      "2026-05-25",
      "2026-12-25",
      "2026-12-26",
    ]);
    expect(cal.get("2026-04-03")).toEqual({ key: "langfredag", from: null });
  });

  it("supports agreement-specific days and half days", () => {
    const cal = buildHolidayCalendar(
      {
        holidays: ["juleaftensdag", "grundlovsdag"],
        partial: [{ key: "grundlovsdag", from: "12:00" }],
      },
      [2026],
    );
    expect(cal.get("2026-12-24")).toEqual({ key: "juleaftensdag", from: null });
    expect(cal.get("2026-06-05")).toEqual({ key: "grundlovsdag", from: "12:00" });
  });

  it("store bededag only exists before 2024", () => {
    const cal = buildHolidayCalendar({ holidays: ["store_bededag"] }, [2023, 2024]);
    expect([...cal.keys()]).toEqual(["2023-05-05"]);
  });

  it("a holiday on a Sunday is still a holiday (juledag 2022)", () => {
    const cal = buildHolidayCalendar({ holidays: ["juledag"] }, [2022]);
    expect(cal.get("2022-12-25")?.key).toBe("juledag");
  });
});
