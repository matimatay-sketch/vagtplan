import { describe, expect, it } from "vitest";
import { PERMISSIONS, canInDepartment, hasAny, normalizeGrants, scopeOf } from "./permissions";

describe("permission catalog", () => {
  it("matches the database catalog (supabase/migrations/*permission_profiles.sql)", () => {
    expect(PERMISSIONS.map((p) => p.key)).toEqual([
      "employees.view",
      "employees.manage",
      "employees.invite",
      "contracts.view",
      "contracts.manage",
      "departments.manage",
      "users.manage",
      "settings.manage",
      "agreements.manage",
      "audit.view",
      "schedule.view",
      "schedule.manage",
      "schedule.publish",
      "schedule.override",
      "projects.view",
      "projects.manage",
      "time.view",
      "time.manage",
      "time.approve",
      "absence.view",
      "absence.manage",
      "absence.approve",
      "payroll.view",
      "payroll.manage",
    ]);
  });
});

describe("scope helpers", () => {
  const perms = { "employees.view": "departments", "settings.manage": "organization" } as const;

  it("reads scopes", () => {
    expect(scopeOf(perms, "employees.view")).toBe("departments");
    expect(scopeOf(perms, "contracts.view")).toBeNull();
  });

  it("hasAny is true when any permission has any scope", () => {
    expect(hasAny(perms, ["contracts.view", "employees.view"])).toBe(true);
    expect(hasAny(perms, ["contracts.view"])).toBe(false);
  });

  it("department scope only covers responsible departments", () => {
    expect(canInDepartment(perms, "employees.view", "d1", ["d1"])).toBe(true);
    expect(canInDepartment(perms, "employees.view", "d2", ["d1"])).toBe(false);
    expect(canInDepartment({ "employees.view": "organization" }, "employees.view", "d2", [])).toBe(
      true,
    );
  });
});

describe("normalizeGrants", () => {
  it("drops scopes a permission does not allow", () => {
    expect(normalizeGrants({ "departments.manage": "departments" })).toEqual({});
  });

  it("manage implies view with at least the same scope", () => {
    expect(
      normalizeGrants({ "employees.manage": "organization", "employees.view": "departments" }),
    ).toEqual({
      "employees.manage": "organization",
      "employees.view": "organization",
    });
    expect(normalizeGrants({ "contracts.manage": "departments" })).toEqual({
      "contracts.manage": "departments",
      "contracts.view": "departments",
    });
  });

  it("implications chain: override → publish → view", () => {
    expect(normalizeGrants({ "schedule.override": "departments" })).toEqual({
      "schedule.override": "departments",
      "schedule.publish": "departments",
      "schedule.view": "departments",
    });
  });

  it("invite implies view", () => {
    expect(normalizeGrants({ "employees.invite": "departments" })).toEqual({
      "employees.invite": "departments",
      "employees.view": "departments",
    });
  });
});
