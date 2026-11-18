import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { PostingDimension } from "@/lib/domain/posting";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Active posting dimensions with their active values (and department limits). */
export async function loadPostingDimensions(supabase: Client): Promise<PostingDimension[]> {
  const { data } = await supabase
    .from("posting_dimension")
    .select(
      "id, key, name, required, sort_order, posting_value (id, code, name, archived_at, posting_value_department (department_id))",
    )
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  return (data ?? []).map((d) => ({
    id: d.id,
    key: d.key,
    name: d.name,
    required: d.required,
    values: d.posting_value
      .filter((v) => v.archived_at === null)
      .sort((a, b) => a.code.localeCompare(b.code, "da", { numeric: true }))
      .map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        departmentIds: v.posting_value_department.map((x) => x.department_id),
      })),
  }));
}
