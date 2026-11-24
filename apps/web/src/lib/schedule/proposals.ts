import "server-only";
import type { AppContext } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import { validateWeek } from "@/lib/schedule/validate-week";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Shared by the AI assistant's proposals and the built-in proposal. */
export async function archiveShifts(supabase: Client, ids: string[]) {
  if (ids.length)
    await supabase.from("shift").update({ archived_at: new Date().toISOString() }).in("id", ids);
}

/** Blocking violations the engine finds on the proposed shifts. */
export async function blockingFor(
  supabase: Client,
  ctx: AppContext,
  employeeIds: string[],
  weekStart: string,
  shiftIds: string[],
) {
  if (shiftIds.length === 0) return [];
  const proposed = new Set(shiftIds);
  const violations = await validateWeek(supabase, {
    organizationId: ctx.organization.id,
    employeeIds,
    weekStart,
    timezone: ctx.organization.timezone,
  });
  return violations.filter(
    (v) => v.severity === "BLOCKING" && v.intervalIds.some((id) => proposed.has(id)),
  );
}
