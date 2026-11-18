import "server-only";
import { addDays, type IsoDate } from "@/lib/domain/civil-date";
import { zonedTime } from "@/lib/domain/schedule-time";
import { parsePaging, parseRange } from "@/lib/domain/api";
import { ApiError, type ApiContext } from "./handler";

/** ?from&to as UTC instants covering the local dates (Europe/Copenhagen). */
export function rangeOf(ctx: ApiContext): {
  from: IsoDate;
  to: IsoDate;
  fromIso: string;
  toIso: string;
} {
  const r = parseRange(ctx.url.searchParams);
  if ("error" in r) throw new ApiError(400, "invalid_query", r.error);
  return {
    ...r,
    fromIso: new Date(zonedTime(r.from)).toISOString(),
    toIso: new Date(zonedTime(addDays(r.to, 1))).toISOString(),
  };
}

export const pagingOf = (ctx: ApiContext) => parsePaging(ctx.url.searchParams);

/** employee id → employee number for the organization. */
export async function employeeNumbers(ctx: ApiContext, ids: readonly (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await ctx.db
    .from("employee")
    .select("id, employee_number")
    .eq("organization_id", ctx.organizationId)
    .in("id", unique);
  return new Map((data ?? []).map((e) => [e.id, e.employee_number]));
}

/** Resolves an employee of the organization by id or employee number. */
export async function resolveEmployee(
  ctx: ApiContext,
  by: { employee_id?: string | null; employee_number?: string | null },
): Promise<string> {
  let q = ctx.db
    .from("employee")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .is("archived_at", null);
  if (by.employee_id) q = q.eq("id", by.employee_id);
  else if (by.employee_number) q = q.eq("employee_number", by.employee_number);
  else throw new ApiError(422, "invalid", "employee_id or employee_number is required");
  const { data } = await q.maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "employee not found");
  return data.id;
}

/** posting {dimension id: value id} → {dimension key: value code}. */
export async function postingCodes(ctx: ApiContext) {
  const { data } = await ctx.db
    .from("posting_dimension")
    .select("id, key, posting_value (id, code)")
    .eq("organization_id", ctx.organizationId);
  const dims = new Map<string, string>();
  const values = new Map<string, string>();
  for (const d of data ?? []) {
    dims.set(d.id, d.key);
    for (const v of d.posting_value) values.set(v.id, v.code);
  }
  return (posting: unknown): Record<string, string> =>
    Object.fromEntries(
      Object.entries((posting ?? {}) as Record<string, string>).map(([d, v]) => [
        dims.get(d) ?? d,
        values.get(v) ?? v,
      ]),
    );
}
