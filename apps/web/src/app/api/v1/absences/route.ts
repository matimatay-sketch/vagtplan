import { apiRoute, dbError, json, ApiError } from "@/lib/api/handler";
import { employeeNumbers, rangeOf } from "@/lib/api/util";

const STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;

/** Absence and leave overlapping the period. */
export const GET = apiRoute("absence.read", async (ctx) => {
  const r = rangeOf(ctx);
  const status = ctx.url.searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status))
    throw new ApiError(400, "invalid_query", `status must be one of ${STATUSES.join(", ")}`);
  let query = ctx.db
    .from("absence")
    .select("id, employee_id, type_code, from_date, to_date, status, days_hundredths")
    .eq("organization_id", ctx.organizationId)
    .lte("from_date", r.to)
    .gte("to_date", r.from)
    .order("from_date");
  if (status) query = query.eq("status", status as (typeof STATUSES)[number]);
  const { data, error } = await query;
  if (error) throw dbError(error);
  const numbers = await employeeNumbers(
    ctx,
    (data ?? []).map((a) => a.employee_id),
  );
  return json({
    data: (data ?? []).map((a) => ({
      id: a.id,
      employee_id: a.employee_id,
      employee_number: numbers.get(a.employee_id) ?? null,
      type: a.type_code,
      from_date: a.from_date,
      to_date: a.to_date,
      status: a.status,
      /** Days in hundredths (150 = 1,5 days); null until calculated. */
      days_hundredths: a.days_hundredths,
    })),
  });
});
