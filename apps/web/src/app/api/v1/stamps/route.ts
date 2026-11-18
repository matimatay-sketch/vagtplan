import { z } from "zod";
import { apiRoute, dbError, json, readJson } from "@/lib/api/handler";
import { resolveEmployee } from "@/lib/api/util";

const schema = z
  .object({
    employee_id: z.guid().optional(),
    employee_number: z.string().trim().min(1).max(50).optional(),
    action: z.enum(["in", "out"]),
    /** When it happened (ISO 8601); default now. At most 7 days back. */
    at: z.iso.datetime({ offset: true }).optional(),
    /** A UUID from the terminal: sending the same stamp again does not create a duplicate. */
    client_id: z.guid(),
  })
  .refine((v) => v.employee_id || v.employee_number, {
    message: "employee_id or employee_number is required",
  });

/** Stamps an employee in or out (e.g. from a terminal). */
export const POST = apiRoute("time.stamp", async (ctx, req) => {
  const b = await readJson(req, (v) => schema.safeParse(v));
  const employeeId = await resolveEmployee(ctx, b);
  const { data, error } = await ctx.db.rpc("api_stamp", {
    p_organization_id: ctx.organizationId,
    p_employee_id: employeeId,
    p_client_id: b.client_id,
    p_action: b.action,
    p_at: b.at ?? new Date().toISOString(),
  });
  if (error) throw dbError(error);
  const { data: entry } = await ctx.db
    .from("time_entry")
    .select("id, start_at, end_at, status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", data)
    .single();
  return json({ data: { time_entry: entry, action: b.action } });
});
