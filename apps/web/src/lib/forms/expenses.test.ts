import { describe, expect, it } from "vitest";
import { expenseCategorySchema, expenseSchema, mileageRateSchema, tripSchema } from "./expenses";

describe("mileageRateSchema", () => {
  it("converts kroner per km to øre and upper-cases pay codes", () => {
    expect(
      mileageRateSchema.parse({
        year: "2027",
        high_rate: "1,23",
        low_rate: "0,45",
        high_limit_km: "1000",
        pay_code_high: "km_hoej",
        pay_code_low: "KM_LAV",
        source: "Kundens satser",
      }),
    ).toEqual({
      year: 2027,
      high_rate: 123,
      low_rate: 45,
      high_limit_km: 1000,
      pay_code_high: "KM_HOEJ",
      pay_code_low: "KM_LAV",
      source: "Kundens satser",
    });
  });
  it("needs a source and valid numbers", () => {
    const r = mileageRateSchema.safeParse({
      year: "1999",
      high_rate: "x",
      low_rate: "1",
      high_limit_km: "-1",
      pay_code_high: "A",
      pay_code_low: "B",
      source: "",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual([
      "high_limit_km",
      "high_rate",
      "source",
      "year",
    ]);
  });
});

describe("expenseCategorySchema", () => {
  it("an unticked receipt box means no receipt is required", () => {
    expect(expenseCategorySchema.parse({ name: "Bro", pay_code: "bro" })).toEqual({
      name: "Bro",
      pay_code: "BRO",
      receipt_required: false,
    });
  });
});

describe("tripSchema", () => {
  const base = {
    trip_date: "2027-03-02",
    purpose: "Kundebesøg",
    from_address: "Butikken",
    to_address: "Kunden",
    km: "42,5",
  };
  it("reads km as metres, stops and posting from JSON", () => {
    const t = tripSchema.parse({
      ...base,
      stops: '["Lageret"]',
      posting: '{"70000000-0000-0000-0000-0000000000d1":"70000000-0000-0000-0000-000000001100"}',
    });
    expect(t.km).toBe(42_500);
    expect(t.stops).toEqual(["Lageret"]);
    expect(t.vehicle).toBeNull();
    expect(Object.keys(t.posting)).toHaveLength(1);
  });
  it("rejects zero km and a missing purpose", () => {
    const r = tripSchema.safeParse({ ...base, km: "0", purpose: "" });
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["km", "purpose"]);
  });
});

describe("expenseSchema", () => {
  it("needs a positive amount", () => {
    const base = {
      expense_date: "2027-03-02",
      category_id: "73000000-0000-0000-0000-000000000001",
      description: "P-billet",
    };
    expect(expenseSchema.parse({ ...base, amount: "45,00" }).amount).toBe(4500);
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });
});
