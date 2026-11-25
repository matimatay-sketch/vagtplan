import { describe, expect, it } from "vitest";
import { parseCoordinates, workplaceSchema } from "./workplace";

const base = { name: " Butikken ", address: "", coordinates: "55.6761, 12.5683", radius_m: "200" };

describe("parseCoordinates", () => {
  it("reads 'latitude, longitude' as copied from a map", () => {
    expect(parseCoordinates("55.6761, 12.5683")).toEqual({ latitude: 55.6761, longitude: 12.5683 });
    expect(parseCoordinates("  55.6761,12.5683 ")).toEqual({
      latitude: 55.6761,
      longitude: 12.5683,
    });
  });

  it("reads Danish decimal commas separated by a space or semicolon", () => {
    expect(parseCoordinates("55,6761 12,5683")).toEqual({ latitude: 55.6761, longitude: 12.5683 });
    expect(parseCoordinates("55,6761; 12,5683")).toEqual({ latitude: 55.6761, longitude: 12.5683 });
  });

  it("refuses positions that do not exist", () => {
    expect(parseCoordinates("95, 12")).toBeNull();
    expect(parseCoordinates("55, 190")).toBeNull();
    expect(parseCoordinates("Strøget 1")).toBeNull();
    expect(parseCoordinates("")).toBeNull();
  });
});

describe("workplaceSchema", () => {
  it("accepts a workplace and trims the name", () => {
    const r = workplaceSchema.parse({
      ...base,
      department_ids: ["30000000-0000-0000-0000-000000000001"],
    });
    expect(r).toEqual({
      name: "Butikken",
      address: null,
      latitude: 55.6761,
      longitude: 12.5683,
      radius_m: 200,
      department_ids: ["30000000-0000-0000-0000-000000000001"],
    });
  });

  it("needs a name and a position", () => {
    const r = workplaceSchema.safeParse({ ...base, name: " ", coordinates: "x" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["coordinates", "name"]);
  });

  it("keeps the radius between 25 m and 5 km", () => {
    expect(workplaceSchema.safeParse({ ...base, radius_m: "24" }).success).toBe(false);
    expect(workplaceSchema.safeParse({ ...base, radius_m: "25" }).success).toBe(true);
    expect(workplaceSchema.safeParse({ ...base, radius_m: "5000" }).success).toBe(true);
    expect(workplaceSchema.safeParse({ ...base, radius_m: "5001" }).success).toBe(false);
  });
});
