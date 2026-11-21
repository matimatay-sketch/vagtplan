import { apiRoute, dbError, json } from "@/lib/api/handler";

/** Agreements a contract can refer to (system templates and the organization's own). */
export const GET = apiRoute("employees.read", async (ctx) => {
  const { data, error } = await ctx.db
    .from("agreement")
    .select("id, key, name, kind, is_example, organization_id")
    .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
    .is("archived_at", null)
    .order("name");
  if (error) throw dbError(error);
  return json({
    data: (data ?? []).map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      kind: a.kind,
      example: a.is_example,
      own: a.organization_id !== null,
    })),
  });
});
