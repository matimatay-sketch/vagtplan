/**
 * Editing a starter kit (platform): its agreement versions and the rates of
 * its supplement types. Pure; the database stores the whole content.
 */
import { addDays } from "./civil-date";

type VersionDoc = {
  id: string;
  version: number;
  valid_from: string;
  valid_to: string | null;
  [k: string]: unknown;
};

export type KitSupplementType = {
  name: string;
  pay_code: string;
  amount_type: "per_hour" | "fixed" | "percent";
  amounts: { valid_from: string; amount: number }[];
};
export type KitPayPeriodGroup = {
  name: string;
  frequency: "weekly" | "biweekly";
  anchor_date: string;
};
export type KitContent = {
  agreement: { key: string; name: string; kind: string; versions: VersionDoc[] };
  pay_period_groups: KitPayPeriodGroup[];
  supplement_types: KitSupplementType[];
  [k: string]: unknown;
};

export function kitVersions(kit: KitContent): VersionDoc[] {
  return [...kit.agreement.versions].sort((a, b) => b.version - a.version);
}

/** The version `version` replaced by `doc`; key, number and validity follow the kit. */
export function replaceKitVersion(kit: KitContent, version: number, doc: object): KitContent {
  const old = kit.agreement.versions.find((v) => v.version === version);
  if (!old) throw new Error(`unknown version ${version}`);
  const next: VersionDoc = {
    ...(doc as VersionDoc),
    id: kit.agreement.key,
    version,
    valid_from: old.valid_from,
    valid_to: old.valid_to,
  };
  return {
    ...kit,
    agreement: {
      ...kit.agreement,
      versions: kit.agreement.versions.map((v) => (v.version === version ? next : v)),
    },
  };
}

/**
 * A new version from `validFrom`, copied from the latest. The open version
 * ends the day before, and each supplement type gets a rate for the new date
 * (the latest rate, to be changed).
 */
export function addKitVersion(kit: KitContent, validFrom: string): KitContent {
  const latest = kitVersions(kit)[0];
  if (!latest) throw new Error("the kit has no versions");
  if (validFrom <= latest.valid_from) throw new Error("a new version must start after the latest");
  const end = addDays(validFrom, -1);
  const versions = kit.agreement.versions.map((v) =>
    v.valid_to === null || v.valid_to >= validFrom ? { ...v, valid_to: end } : v,
  );
  versions.push({
    ...structuredClone(latest),
    version: latest.version + 1,
    valid_from: validFrom,
    valid_to: null,
  });
  return {
    ...kit,
    agreement: { ...kit.agreement, versions },
    supplement_types: kit.supplement_types.map((s) => {
      const last = [...s.amounts].sort((a, b) => a.valid_from.localeCompare(b.valid_from)).at(-1);
      return last
        ? { ...s, amounts: [...s.amounts, { valid_from: validFrom, amount: last.amount }] }
        : s;
    }),
  };
}
