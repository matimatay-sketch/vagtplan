import { describe, expect, it } from "vitest";
import { formatSupplementAmount } from "./supplements";

describe("formatSupplementAmount", () => {
  it("formats per hour, fixed and percent", () => {
    expect(formatSupplementAmount({ amountType: "per_hour", amount: 2550 })).toBe("25,50 kr./t");
    expect(formatSupplementAmount({ amountType: "fixed", amount: 10000 })).toBe("100,00 kr./vagt");
    expect(formatSupplementAmount({ amountType: "percent", amount: 1250 })).toBe("12,5 %");
  });
});
