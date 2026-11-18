import { apiRoute, dbError, json, ApiError } from "@/lib/api/handler";
import { employeeNumbers, pagingOf, postingCodes, rangeOf, resolveEmployee } from "@/lib/api/util";

const STATUSES = ["open", "pending", "approved"] as const;

/** Registered time (current versions), by start time. Approved time is final. */
export const GET = apiRoute("time.read", async (ctx) => {
  const r = rangeOf(ctx);
  const { limit, offset } = pagingOf(ctx);
  const q = ctx.url.searchParams;
  const status = q.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status))
    throw new ApiError(400, "invalid_query", `status must be one of ${STATUSES.join(", ")}`);
  let query = ctx.db
    .from("time_entry")
    .select(
      "id, employee_id, department_id, shift_id, start_at, end_at, breaks, kind, source, status, approved_at, supersedes_id, deviation_reason, posting_allocations, supplement_type_ids",
    )
    .eq("organization_id", ctx.organizationId)
    .is("superseded_at", null)
    .is("archived_at", null)
    .gte("start_at", r.fromIso)
    .lt("start_at", r.toIso)
    .order("start_at")
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status as (typeof STATUSES)[number]);
  if (q.get("employee_number") || q.get("employee_id"))
    query = query.eq(
      "employee_id",
      await resolveEmployee(ctx, {
        employee_number: q.get("employee_number"),
        employee_id: q.get("employee_id"),
      }),
    );
  const { data, error } = await query;
  if (error) throw dbError(error);
  const [numbers, codes] = await Promise.all([
    employeeNumbers(
      ctx,
      (data ?? []).map((t) => t.employee_id),
    ),
    postingCodes(ctx),
  ]);
  return json({
    data: (data ?? []).map((t) => ({
      id: t.id,
      employee_id: t.employee_id,
      employee_number: numbers.get(t.employee_id) ?? null,
      department_id: t.department_id,
      shift_id: t.shift_id,
      start_at: t.start_at,
      end_at: t.end_at,
      breaks: t.breaks,
      kind: t.kind,
      source: t.source,
      status: t.status,
      approved_at: t.approved_at,
      supersedes_id: t.supersedes_id,
      deviation_reason: t.deviation_reason,
      supplement_type_ids: t.supplement_type_ids,
      posting: (
        (t.posting_allocations ?? []) as {
          values: Record<string, string>;
          start_at: string | null;
          end_at: string | null;
          minutes: number | null;
        }[]
      ).map((a) => ({
        values: codes(a.values),
        start_at: a.start_at,
        end_at: a.end_at,
        minutes: a.minutes,
      })),
    })),
    limit,
    offset,
  });
});
