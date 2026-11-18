import { apiRoute, dbError, json } from "@/lib/api/handler";
import { pagingOf } from "@/lib/api/util";

/** Pay periods, newest first. */
export const GET = apiRoute("payroll.read", async (ctx) => {
  const { limit, offset } = pagingOf(ctx);
  const status = ctx.url.searchParams.get("status");
  let query = ctx.db
    .from("pay_period")
    .select(
      "id, group_id, start_date, end_date, status, closed_at, pay_period_group!pay_period_organization_id_group_id_fkey (name)",
    )
    .eq("organization_id", ctx.organizationId)
    .order("start_date", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status === "open" || status === "closed") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return json({
    data: (data ?? []).map((p) => ({
      id: p.id,
      group_id: p.group_id,
      group_name: p.pay_period_group?.name ?? null,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      closed_at: p.closed_at,
    })),
    limit,
    offset,
  });
});
