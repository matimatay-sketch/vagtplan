import { describe, expect, it } from "vitest";
import { compareProfiles } from "./profile-compare";

const catalog = [
  { key: "a.view", group: "A", label: "Se A", scopes: ["departments", "organization"] },
  { key: "a.manage", group: "A", label: "Redigér A", scopes: ["departments", "organization"] },
  { key: "b.manage", group: "B", label: "Redigér B", scopes: ["organization"] },
] as const;

describe("compareProfiles", () => {
  const leder = {
    id: "l",
    grants: { "a.view": "departments", "a.manage": "departments" },
  } as const;
  const admin = {
    id: "o",
    grants: { "a.view": "organization", "a.manage": "departments", "b.manage": "organization" },
  } as const;
  const tom = { id: "t", grants: {} } as const;

  it("lines up each permission's scope per profile, grouped as in the catalog", () => {
    const r = compareProfiles(catalog, [leder, admin]);
    expect(r.groups.map((g) => g.group)).toEqual(["A", "B"]);
    expect(r.groups[0]!.rows).toEqual([
      { key: "a.view", label: "Se A", scopes: ["departments", "organization"], differs: true },
      {
        key: "a.manage",
        label: "Redigér A",
        scopes: ["departments", "departments"],
        differs: false,
      },
    ]);
    expect(r.groups[1]!.rows[0]).toMatchObject({ scopes: [null, "organization"], differs: true });
  });

  it("counts permissions and differences per profile", () => {
    const r = compareProfiles(catalog, [leder, admin, tom]);
    expect(r.counts).toEqual([2, 3, 0]);
    expect(r.differences).toBe(3);
  });

  it("can keep only the rows that differ; groups without any are dropped", () => {
    const r = compareProfiles(catalog, [leder, admin], { onlyDifferences: true });
    expect(r.groups.map((g) => g.rows.map((x) => x.key))).toEqual([["a.view"], ["b.manage"]]);
    const same = compareProfiles(catalog, [leder, leder], { onlyDifferences: true });
    expect(same.groups).toEqual([]);
    expect(same.differences).toBe(0);
  });

  it("keeps a group together even when the catalog lists it in two places", () => {
    const split = [catalog[0], catalog[2], catalog[1]];
    const r = compareProfiles(split, [admin]);
    expect(r.groups.map((g) => [g.group, g.rows.map((x) => x.key)])).toEqual([
      ["A", ["a.view", "a.manage"]],
      ["B", ["b.manage"]],
    ]);
  });

  it("a single profile has no differences", () => {
    expect(compareProfiles(catalog, [admin]).differences).toBe(0);
  });
});
