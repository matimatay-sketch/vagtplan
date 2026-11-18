import { z } from "zod";
import { apiRoute, dbError, json, ApiError } from "@/lib/api/handler";
import { employeeNumbers, postingCodes } from "@/lib/api/util";

type Params = { id: string };

/** The current pay lines of a period (the latest calculation per employee). */
export const GET = apiRoute<Params>("payroll.read", async (ctx, _req, params) => {
  const id = z.guid().safeParse(params.id);
  if (!id.success) throw new ApiError(404, "not_found", "pay period not found");
  const { data: period } = await ctx.db
    .from("pay_period")
    .select("id, start_date, end_date, status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id.data)
    .maybeSingle();
  if (!period) throw new ApiError(404, "not_found", "pay period not found");
  const { data: runs, error } = await ctx.db
    .from("pay_run")
    .select(
      "id, employee_id, calculated_at, pending_entries, pay_line!pay_line_organization_id_pay_run_id_fkey (position, pay_code, label, unit, quantity_minutes, rate_ore, amount_ore, posting)",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("pay_period_id", period.id)
    .is("superseded_at", null);
  if (error) throw dbError(error);
  const [numbers, codes] = await Promise.all([
    employeeNumbers(
      ctx,
      (runs ?? []).map((r) => r.employee_id),
    ),
    postingCodes(ctx),
  ]);
  return json({
    period: {
      id: period.id,
      start_date: period.start_date,
      end_date: period.end_date,
      status: period.status,
    },
    data: (runs ?? []).flatMap((r) =>
      [...r.pay_line]
        .sort((a, b) => a.position - b.position)
        .map((l) => ({
          employee_id: r.employee_id,
          employee_number: numbers.get(r.employee_id) ?? null,
          pay_code: l.pay_code,
          label: l.label,
          /** hours | time_off_minutes | fixed | km */
          unit: l.unit,
          /** Minutes; metres for km; 0 for fixed amounts. */
          quantity: l.quantity_minutes,
          rate_ore: l.rate_ore,
          amount_ore: Number(l.amount_ore),
          posting: codes(l.posting),
          calculated_at: r.calculated_at,
        })),
    ),
  });
});
