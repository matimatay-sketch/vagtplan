import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";
import { validateWeek, violationKey, type EmployeeViolation } from "@/lib/schedule/validate-week";
import { localParts, weekStartOf } from "@/lib/domain/schedule-time";

type Service = ReturnType<typeof createServiceClient>;

/**
 * New violations that block a swap: the working-time rules are checked for
 * both employees as if the swap had happened. Violations that were already
 * there before the swap do not count. Called with the service client only
 * after the database has confirmed that the actor may take part in the swap.
 */
export async function swapViolations(
  db: Service,
  swapId: string,
  timezone: string,
): Promise<EmployeeViolation[]> {
  const { data: w, error } = await db
    .from("shift_swap")
    .select("organization_id, requester_employee_id, target_employee_id, shift_id, target_shift_id")
    .eq("id", swapId)
    .single();
  if (error || !w) throw error ?? new Error("swap not found");
  const ids = [w.shift_id, w.target_shift_id].filter((x): x is string => !!x);
  const { data: shifts } = await db.from("shift").select("id, start_at").in("id", ids);
  const reassign: Record<string, string> = { [w.shift_id]: w.target_employee_id };
  if (w.target_shift_id) reassign[w.target_shift_id] = w.requester_employee_id;
  const weeks = [...new Set((shifts ?? []).map((s) => weekStartOf(localParts(s.start_at).date)))];
  const employeeIds = [w.requester_employee_id, w.target_employee_id];

  const out: EmployeeViolation[] = [];
  for (const weekStart of weeks) {
    const opts = {
      organizationId: w.organization_id,
      employeeIds,
      weekStart,
      timezone,
      trusted: true,
    };
    const [before, after] = await Promise.all([
      validateWeek(db, opts),
      validateWeek(db, { ...opts, reassign }),
    ]);
    const known = new Set(before.map(violationKey));
    out.push(...after.filter((v) => v.handling === "block" && !known.has(violationKey(v))));
  }
  return out;
}
