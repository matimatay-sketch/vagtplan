import { z } from "zod";
import { apiRoute, dbError, json, readJson, ApiError } from "@/lib/api/handler";

type Params = { id: string };

const schema = z.object({
  agreement_id: z.guid(),
  pay_form: z.enum(["hourly", "monthly"]),
  /** Weekly norm in minutes (37 hours = 2220). */
  weekly_minutes: z.number().int().min(0).max(4800),
  pay_period_group_id: z.guid(),
  staff_group: z.string().trim().max(100).nullish(),
  valid_from: z.iso.date(),
  valid_to: z.iso.date().nullish(),
});

/** Adds a contract (a new period of employment terms) to an employee. */
export const POST = apiRoute<Params>("employees.write", async (ctx, req, params) => {
  const employeeId = z.guid().safeParse(params.id);
  if (!employeeId.success) throw new ApiError(404, "not_found", "employee not found");
  const b = await readJson(req, (v) => schema.safeParse(v));
  const [{ data: employee }, { data: agreement }] = await Promise.all([
    ctx.db
      .from("employee")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", employeeId.data)
      .maybeSingle(),
    ctx.db.from("agreement").select("id, organization_id").eq("id", b.agreement_id).maybeSingle(),
  ]);
  if (!employee) throw new ApiError(404, "not_found", "employee not found");
  if (!agreement || (agreement.organization_id && agreement.organization_id !== ctx.organizationId))
    throw new ApiError(422, "invalid", "agreement_id: unknown agreement");
  const { data, error } = await ctx.db
    .from("contract")
    .insert({
      organization_id: ctx.organizationId,
      employee_id: employee.id,
      agreement_id: b.agreement_id,
      pay_form: b.pay_form,
      weekly_norm_minutes: b.weekly_minutes,
      pay_period_group_id: b.pay_period_group_id,
      staff_group: b.staff_group ?? null,
      valid_from: b.valid_from,
      valid_to: b.valid_to ?? null,
    })
    .select(
      "id, agreement_id, pay_form, weekly_norm_minutes, pay_period_group_id, staff_group, valid_from, valid_to",
    )
    .single();
  if (error) throw dbError(error);
  return json(
    {
      data: {
        id: data.id,
        agreement_id: data.agreement_id,
        pay_form: data.pay_form,
        weekly_minutes: data.weekly_norm_minutes,
        pay_period_group_id: data.pay_period_group_id,
        staff_group: data.staff_group,
        valid_from: data.valid_from,
        valid_to: data.valid_to,
      },
    },
    201,
  );
});
