import { describe, expect, it } from "vitest";
import { projectFormSchema } from "./projects";

const D = "00000000-0000-0000-0000-0000000000d1";

describe("projectFormSchema", () => {
  it("trims fields, empty customer is null, departments from JSON", () => {
    const r = projectFormSchema.parse({
      number: " P-100 ",
      name: " Ombygning ",
      customer: "",
      department_ids: JSON.stringify([D]),
    });
    expect(r).toEqual({
      id: null,
      number: "P-100",
      name: "Ombygning",
      customer: null,
      department_ids: [D],
    });
  });
  it("number and name are required; no departments means all", () => {
    const r = projectFormSchema.safeParse({ number: " ", name: "", department_ids: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(["number", "name"]);
    expect(projectFormSchema.parse({ number: "1", name: "x" }).department_ids).toEqual([]);
  });
  it("limits lengths", () => {
    const r = projectFormSchema.safeParse({
      number: "x".repeat(41),
      name: "y".repeat(121),
      customer: "z".repeat(121),
    });
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(["number", "name", "customer"]);
  });
});
