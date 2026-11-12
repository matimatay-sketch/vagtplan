import { describe, expect, it } from "vitest";
import { formatHours, hoursToMinutes, parseDanishDecimal } from "./numbers";

describe("parseDanishDecimal", () => {
  it.each([
    ["37", 37],
    ["15,5", 15.5],
    ["15.5", 15.5],
    [" 7,25 ", 7.25],
    ["0", 0],
  ])("parses %j", (input, expected) => {
    expect(parseDanishDecimal(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "1.000,5", "-", "12a"])("rejects %j", (input) => {
    expect(parseDanishDecimal(input)).toBeNull();
  });
});

describe("hoursToMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(hoursToMinutes(37)).toBe(2220);
    expect(hoursToMinutes(15.5)).toBe(930);
    expect(hoursToMinutes(7.4)).toBe(444);
    expect(hoursToMinutes(1 / 3)).toBe(20);
  });
});

describe("formatHours", () => {
  it("formats minutes as Danish hours", () => {
    expect(formatHours(2220)).toBe("37");
    expect(formatHours(930)).toBe("15,5");
    expect(formatHours(444)).toBe("7,4");
    expect(formatHours(20)).toBe("0,33");
    expect(formatHours(0)).toBe("0");
  });
});
