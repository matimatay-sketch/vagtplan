import { z } from "zod";
import { apiRoute, dbError, json, readJson, ApiError } from "@/lib/api/handler";
import { pagingOf } from "@/lib/api/util";
import {
  EMPLOYEE_SELECT as SELECT,
  toApiEmployee,
  type EmployeeRow as Row,
} from "@/lib/api/employees";

export const GET = apiRoute("employees.read", async (ctx) => {
  const { limit, offset } = pagingOf(ctx);
  const q = ctx.url.searchParams;
  let query = ctx.db
    .from("employee")
    .select(SELECT)
    .eq("organization_id", ctx.organizationId)
    .order("employee_number")
    .range(offset, offset + limit - 1);
  if (q.get("employee_number")) query = query.eq("employee_number", q.get("employee_number")!);
  if (q.get("include_archived") !== "true") query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return json({ data: (data as unknown as Row[]).map(toApiEmployee), limit, offset });
});

const date = z.iso.date();
const createSchema = z.object({
  employee_number: z.string().trim().min(1).max(50),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  birth_date: date,
  email: z.email().nullish(),
  phone: z.string().trim().max(40).nullish(),
  hired_on: date.nullish(),
  /** The first is the primary department. */
  department_ids: z.array(z.guid()).min(1).max(20),
});

export const POST = apiRoute(
  "employees.write",
  async (ctx, req) => {
    const b = await readJson(req, (v) => createSchema.safeParse(v));
    const { data: depts } = await ctx.db
      .from("department")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .is("archived_at", null)
      .in("id", b.department_ids);
    if ((depts ?? []).length !== new Set(b.department_ids).size)
      throw new ApiError(422, "invalid", "department_ids: unknown department");
    const { data: created, error } = await ctx.db
      .from("employee")
      .insert({
        organization_id: ctx.organizationId,
        employee_number: b.employee_number,
        first_name: b.first_name,
        last_name: b.last_name,
        birth_date: b.birth_date,
        email: b.email ?? null,
        phone: b.phone ?? null,
        hired_on: b.hired_on ?? null,
      })
      .select("id")
      .single();
    if (error) throw dbError(error);
    const { error: linkError } = await ctx.db.from("employee_department").insert(
      [...new Set(b.department_ids)].map((department_id, i) => ({
        organization_id: ctx.organizationId,
        employee_id: created.id,
        department_id,
        is_primary: i === 0,
      })),
    );
    if (linkError) throw dbError(linkError);
    const { data } = await ctx.db.from("employee").select(SELECT).eq("id", created.id).single();
    return json({ data: toApiEmployee(data as unknown as Row) }, 201);
  },
  { dispatch: true },
);
