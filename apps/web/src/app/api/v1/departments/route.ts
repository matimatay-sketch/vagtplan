import { z } from "zod";
import { apiRoute, dbError, json, readJson } from "@/lib/api/handler";

export const GET = apiRoute("employees.read", async (ctx) => {
  const { data, error } = await ctx.db
    .from("department")
    .select("id, name, archived_at")
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) throw dbError(error);
  return json({
    data: (data ?? []).map((d) => ({ id: d.id, name: d.name, archived: d.archived_at !== null })),
  });
});

export const POST = apiRoute("employees.write", async (ctx, req) => {
  const b = await readJson(req, (v) =>
    z.object({ name: z.string().trim().min(1).max(200) }).safeParse(v),
  );
  const { data, error } = await ctx.db
    .from("department")
    .insert({ organization_id: ctx.organizationId, name: b.name })
    .select("id, name")
    .single();
  if (error) throw dbError(error);
  return json({ data: { ...data, archived: false } }, 201);
});
