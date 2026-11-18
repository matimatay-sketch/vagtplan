/**
 * Permission catalog. Must match `public.permission` in the database
 * (see supabase/migrations/*permission_profiles.sql); a unit test guards the keys.
 */
export type PermissionScope = "departments" | "organization";

export const PERMISSIONS = [
  {
    key: "employees.view",
    group: "Medarbejdere",
    label: "Se medarbejdere",
    scopes: ["departments", "organization"],
  },
  {
    key: "employees.manage",
    group: "Medarbejdere",
    label: "Opret og redigér medarbejdere",
    scopes: ["departments", "organization"],
  },
  {
    key: "employees.invite",
    group: "Medarbejdere",
    label: "Invitér medarbejdere til login",
    scopes: ["departments", "organization"],
  },
  {
    key: "contracts.view",
    group: "Kontrakter",
    label: "Se kontrakter",
    scopes: ["departments", "organization"],
  },
  {
    key: "contracts.manage",
    group: "Kontrakter",
    label: "Opret og afslut kontrakter",
    scopes: ["departments", "organization"],
  },
  {
    key: "departments.manage",
    group: "Virksomhed",
    label: "Opret og redigér afdelinger",
    scopes: ["organization"],
  },
  {
    key: "users.manage",
    group: "Virksomhed",
    label: "Brugere og rettighedsprofiler",
    scopes: ["organization"],
  },
  {
    key: "settings.manage",
    group: "Virksomhed",
    label: "Lønperioder og indstillinger",
    scopes: ["organization"],
  },
  {
    key: "agreements.manage",
    group: "Virksomhed",
    label: "Overenskomster",
    scopes: ["organization"],
  },
  { key: "audit.view", group: "Virksomhed", label: "Se audit-log", scopes: ["organization"] },
  {
    key: "schedule.view",
    group: "Vagtplan",
    label: "Se vagtplan (kladder)",
    scopes: ["departments", "organization"],
  },
  {
    key: "schedule.manage",
    group: "Vagtplan",
    label: "Planlægge vagter",
    scopes: ["departments", "organization"],
  },
  {
    key: "schedule.publish",
    group: "Vagtplan",
    label: "Offentliggøre vagtplan",
    scopes: ["departments", "organization"],
  },
  {
    key: "schedule.override",
    group: "Vagtplan",
    label: "Tilsidesætte blokerende regler (med begrundelse)",
    scopes: ["departments", "organization"],
  },
  {
    key: "projects.view",
    group: "Projekter",
    label: "Se projekttimer",
    scopes: ["departments", "organization"],
  },
  {
    key: "projects.manage",
    group: "Projekter",
    label: "Oprette og rette projekter",
    scopes: ["organization"],
  },
  {
    key: "posting.manage",
    group: "Kontering",
    label: "Oprette og rette konteringsdimensioner (fx omkostningssteder)",
    scopes: ["organization"],
  },
  {
    key: "expenses.manage",
    group: "Kørsel og udlæg",
    label: "Indtaste km-satser og oprette udlægskategorier",
    scopes: ["organization"],
  },
  {
    key: "time.view",
    group: "Tidsregistrering",
    label: "Se registreret tid",
    scopes: ["departments", "organization"],
  },
  {
    key: "time.manage",
    group: "Tidsregistrering",
    label: "Registrere og rette tid for andre",
    scopes: ["departments", "organization"],
  },
  {
    key: "time.approve",
    group: "Tidsregistrering",
    label: "Godkende registreret tid",
    scopes: ["departments", "organization"],
  },
  {
    key: "absence.view",
    group: "Fravær og ferie",
    label: "Se fravær og saldi",
    scopes: ["departments", "organization"],
  },
  {
    key: "absence.manage",
    group: "Fravær og ferie",
    label: "Registrere fravær og rette saldi",
    scopes: ["departments", "organization"],
  },
  {
    key: "absence.approve",
    group: "Fravær og ferie",
    label: "Godkende fravær og ferie",
    scopes: ["departments", "organization"],
  },
  {
    key: "payroll.view",
    group: "Løn",
    label: "Se lønlinjer",
    scopes: ["departments", "organization"],
  },
  {
    key: "payroll.manage",
    group: "Løn",
    label: "Beregne, afslutte og eksportere løn",
    scopes: ["organization"],
  },
] as const satisfies readonly {
  key: string;
  group: string;
  label: string;
  scopes: readonly PermissionScope[];
}[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export type Permissions = Partial<Record<PermissionKey, PermissionScope>>;

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  departments: "Egne afdelinger",
  organization: "Hele virksomheden",
};

export function isPermissionKey(key: string): key is PermissionKey {
  return PERMISSIONS.some((p) => p.key === key);
}

export function scopeOf(perms: Permissions, key: PermissionKey): PermissionScope | null {
  return perms[key] ?? null;
}

export function hasAny(perms: Permissions, keys: readonly PermissionKey[]): boolean {
  return keys.some((k) => perms[k] !== undefined);
}

export function hasOrg(perms: Permissions, key: PermissionKey): boolean {
  return perms[key] === "organization";
}

export function canInDepartment(
  perms: Permissions,
  key: PermissionKey,
  departmentId: string,
  responsibleDepartmentIds: readonly string[],
): boolean {
  const scope = perms[key];
  return (
    scope === "organization" ||
    (scope === "departments" && responsibleDepartmentIds.includes(departmentId))
  );
}

const rank = (s: PermissionScope | undefined) =>
  s === "organization" ? 2 : s === "departments" ? 1 : 0;

/** Permissions that imply another one (e.g. you cannot edit what you cannot see). */
const IMPLIES: Partial<Record<PermissionKey, PermissionKey>> = {
  "employees.manage": "employees.view",
  "employees.invite": "employees.view",
  "contracts.manage": "contracts.view",
  "schedule.manage": "schedule.view",
  "schedule.publish": "schedule.view",
  "schedule.override": "schedule.publish",
  "time.manage": "time.view",
  "time.approve": "time.view",
  "absence.manage": "absence.view",
  "absence.approve": "absence.view",
  "payroll.manage": "payroll.view",
};

/** Removes disallowed scopes and adds implied permissions. */
export function normalizeGrants(input: Permissions): Permissions {
  const out: Permissions = {};
  for (const p of PERMISSIONS) {
    const scope = input[p.key];
    if (scope && (p.scopes as readonly PermissionScope[]).includes(scope)) out[p.key] = scope;
  }
  // Repeat until stable so chains (override → publish → view) resolve.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, to] of Object.entries(IMPLIES) as [PermissionKey, PermissionKey][]) {
      const s = out[from];
      if (s && rank(out[to]) < rank(s)) {
        out[to] = s;
        changed = true;
      }
    }
  }
  return out;
}
