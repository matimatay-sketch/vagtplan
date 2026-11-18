import { z } from "zod";
import { apiRoute, dbError, json, readJson, ApiError } from "@/lib/api/handler";
import { EMPLOYEE_SELECT as SELECT, toApiEmployee } from "@/lib/api/employees";

type Params = { id: string };
const id = (p: Params) => {
  const r = z.guid().safeParse(p.id);
  if (!r.success) throw new ApiError(404, "not_found", "employee not found");
  return r.data;
};

export const GET = apiRoute<Params>("employees.read", async (ctx, _req, params) => {
  const { data } = await ctx.db
    .from("employee")
    .select(SELECT)
    .eq("organization_id", ctx.organizationId)
    .eq("id", id(params))
    .maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "employee not found");
  return json({ data: toApiEmployee(data as unknown as Parameters<typeof toApiEmployee>[0]) });
});

const date = z.iso.date();
const patchSchema = z
  .object({
    employee_number: z.string().trim().min(1).max(50),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    birth_date: date,
    email: z.email().nullable(),
    phone: z.string().trim().max(40).nullable(),
    hired_on: date.nullable(),
    terminated_on: date.nullable(),
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const PATCH = apiRoute<Params>(
  "employees.write",
  async (ctx, req, params) => {
    const b = await readJson(req, (v) => patchSchema.safeParse(v));
    const { archived, ...fields } = b;
    const update = {
      ...fields,
      ...(archived === undefined
        ? {}
        : { archived_at: archived ? new Date().toISOString() : null }),
    };
    if (Object.keys(update).length === 0) throw new ApiError(422, "invalid", "nothing to change");
    const { data, error } = await ctx.db
      .from("employee")
      .update(update)
      .eq("organization_id", ctx.organizationId)
      .eq("id", id(params))
      .select(SELECT)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "not_found", "employee not found");
    return json({ data: toApiEmployee(data as unknown as Parameters<typeof toApiEmployee>[0]) });
  },
  { dispatch: true },
);
