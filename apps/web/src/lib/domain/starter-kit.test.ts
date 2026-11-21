import { describe, expect, it } from "vitest";
import { addKitVersion, kitVersions, replaceKitVersion, type KitContent } from "./starter-kit";

const doc = (version: number, valid_from: string, valid_to: string | null) => ({
  id: "io",
  name: "IO",
  kind: "agreement",
  version,
  valid_from,
  valid_to,
  inherits_from: "basis-dk",
  rules: [],
});
const kit = (): KitContent => ({
  agreement: {
    key: "io",
    name: "IO",
    kind: "agreement",
    versions: [doc(1, "2025-05-01", "2026-02-28"), doc(2, "2026-03-01", null)],
  },
  pay_period_groups: [],
  supplement_types: [
    {
      name: "Ikke varslet",
      pay_code: "OT",
      amount_type: "per_hour",
      amounts: [
        { valid_from: "2025-05-01", amount: 100 },
        { valid_from: "2026-03-01", amount: 110 },
      ],
    },
  ],
});

describe("starter kit versions", () => {
  it("lists the versions newest first", () => {
    expect(kitVersions(kit()).map((v) => v.version)).toEqual([2, 1]);
  });

  it("replaces a version, keeping its key, number and dates", () => {
    const next = replaceKitVersion(kit(), 1, {
      ...doc(9, "2000-01-01", null),
      name: "Ny",
      id: "x",
    });
    expect(next.agreement.versions[0]).toMatchObject({
      id: "io",
      version: 1,
      valid_from: "2025-05-01",
      valid_to: "2026-02-28",
      name: "Ny",
    });
    expect(next.agreement.versions[1]).toEqual(kit().agreement.versions[1]);
  });

  it("refuses an unknown version", () => {
    expect(() => replaceKitVersion(kit(), 7, doc(7, "2026-01-01", null))).toThrow();
  });

  it("adds a version from a date: the open version ends the day before, the rates carry over", () => {
    const next = addKitVersion(kit(), "2027-03-01");
    expect(next.agreement.versions.map((v) => [v.version, v.valid_from, v.valid_to])).toEqual([
      [1, "2025-05-01", "2026-02-28"],
      [2, "2026-03-01", "2027-02-28"],
      [3, "2027-03-01", null],
    ]);
    expect(next.supplement_types[0]!.amounts.at(-1)).toEqual({
      valid_from: "2027-03-01",
      amount: 110,
    });
  });

  it("a new version must start after the latest one", () => {
    expect(() => addKitVersion(kit(), "2026-03-01")).toThrow();
  });
});
