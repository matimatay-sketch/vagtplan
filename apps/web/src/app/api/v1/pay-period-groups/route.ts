import { apiRoute, dbError, json } from "@/lib/api/handler";

export const GET = apiRoute("employees.read", async (ctx) => {
  const { data, error } = await ctx.db
    .from("pay_period_group")
    .select("id, name, frequency, anchor_date, month_start_day, archived_at")
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) throw dbError(error);
  return json({
    data: (data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      frequency: g.frequency,
      anchor_date: g.anchor_date,
      month_start_day: g.month_start_day,
      archived: g.archived_at !== null,
    })),
  });
});
