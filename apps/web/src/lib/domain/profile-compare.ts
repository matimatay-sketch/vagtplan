/**
 * Side-by-side comparison of rights profiles: one row per permission in the
 * catalog, one column per profile with its scope (or null). Pure.
 */
export type CompareScope = "departments" | "organization";

type CatalogEntry = { key: string; group: string; label: string };

export type CompareRow = {
  key: string;
  label: string;
  /** Scope per profile, in the order the profiles were given (null = not granted). */
  scopes: (CompareScope | null)[];
  /** The profiles do not all have the same scope. */
  differs: boolean;
};

export function compareProfiles(
  catalog: readonly CatalogEntry[],
  profiles: readonly { id: string; grants: Partial<Record<string, CompareScope>> }[],
  opts: { onlyDifferences?: boolean } = {},
): {
  groups: { group: string; rows: CompareRow[] }[];
  /** Number of permissions each profile has. */
  counts: number[];
  /** Number of permissions where the profiles differ. */
  differences: number;
} {
  const rows = catalog.map((p): CompareRow & { group: string } => {
    const scopes = profiles.map((x) => x.grants[p.key] ?? null);
    return {
      key: p.key,
      label: p.label,
      group: p.group,
      scopes,
      differs: scopes.some((s) => s !== scopes[0]),
    };
  });
  // Groups in the order they first appear in the catalog (as in the profile editor).
  const groups = [...new Set(catalog.map((p) => p.group))]
    .map((group) => ({
      group,
      rows: rows
        .filter((r) => r.group === group && (!opts.onlyDifferences || r.differs))
        .map(({ group: _group, ...row }) => row),
    }))
    .filter((g) => g.rows.length > 0);
  return {
    groups,
    counts: profiles.map((_, i) => rows.filter((r) => r.scopes[i] !== null).length),
    differences: rows.filter((r) => r.differs).length,
  };
}
