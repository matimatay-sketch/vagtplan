import type { PermissionKey } from "@/lib/permissions";
import { IMPORT_KINDS, type ImportKind } from "@/lib/domain/csv-import";

/** The right a user needs to import each kind (the database checks it again per row). */
export const IMPORT_PERMISSION: Record<ImportKind, PermissionKey> = {
  departments: "departments.manage",
  employees: "employees.manage",
  shifts: "schedule.manage",
  balances: "absence.manage",
};

export const isImportKind = (v: unknown): v is ImportKind =>
  typeof v === "string" && (IMPORT_KINDS as readonly string[]).includes(v);

/** Files larger than this are refused (about 5000 lines with room to spare). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
