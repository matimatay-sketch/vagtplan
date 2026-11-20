import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { loadPostingDimensions } from "@/lib/posting/load";
import type { PostingDimension } from "@/lib/domain/posting";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Posting values the employee may choose when stamping in: only values that
 * are open to all of the employee's departments, so a stamp is never rejected.
 */
export async function stampPostingFor(
  supabase: Client,
  employeeId: string,
  posting?: PostingDimension[],
): Promise<PostingDimension[]> {
  const [dims, { data: ownDepartments }] = await Promise.all([
    posting ? Promise.resolve(posting) : loadPostingDimensions(supabase),
    supabase.from("employee_department").select("department_id").eq("employee_id", employeeId),
  ]);
  const deptIds = (ownDepartments ?? []).map((d) => d.department_id);
  return dims
    .map((d) => ({
      ...d,
      values: d.values.filter(
        (v) => v.departmentIds.length === 0 || deptIds.every((x) => v.departmentIds.includes(x)),
      ),
    }))
    .filter((d) => d.values.length > 0);
}
