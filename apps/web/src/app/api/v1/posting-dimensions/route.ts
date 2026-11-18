import { apiRoute, dbError, json } from "@/lib/api/handler";

/** Posting dimensions (e.g. cost centre) and their values; projects are the dimension with project: true. */
export const GET = apiRoute("posting.read", async (ctx) => {
  const { data, error } = await ctx.db
    .from("posting_dimension")
    .select(
      "id, key, name, required, is_project, archived_at, posting_value (id, code, name, description, archived_at)",
    )
    .eq("organization_id", ctx.organizationId)
    .order("sort_order");
  if (error) throw dbError(error);
  return json({
    data: (data ?? []).map((d) => ({
      id: d.id,
      key: d.key,
      name: d.name,
      required: d.required,
      project: d.is_project,
      archived: d.archived_at !== null,
      values: d.posting_value.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        description: v.description,
        archived: v.archived_at !== null,
      })),
    })),
  });
});
