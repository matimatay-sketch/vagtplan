import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { DeviationContext, ReasonOption } from "./deviation-types";
import { loadWho } from "./who";
import { todayIn } from "@/lib/domain/civil-date";

export type { DeviationContext, ReasonOption };

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The organization's deviation reasons in use and the threshold for asking,
 * with who the given employees are (the reasons that apply to them).
 */
export async function loadDeviationContext(
  supabase: Client,
  organizationId: string,
  employeeIds: readonly string[] = [],
): Promise<DeviationContext> {
  const [{ data: reasons }, { data: settings }, who] = await Promise.all([
    supabase
      .from("deviation_reason")
      .select("id, name, applies_to, department_ids, agreement_ids, employee_group_ids")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("organization_settings")
      .select("deviation_threshold_minutes")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    loadWho(supabase, employeeIds, todayIn("Europe/Copenhagen")),
  ]);
  return {
    reasons: (reasons ?? []) as unknown as ReasonOption[],
    thresholdMinutes: settings?.deviation_threshold_minutes ?? 5,
    who,
  };
}

/**
 * Published shifts the employee may stamp in to (as the stamp function picks
 * them: start within 4 hours of the stamp, no registration yet), from 12 hours
 * around now so the card can choose at the moment of stamping.
 */
export async function loadStampPlans(
  supabase: Client,
  employeeId: string,
): Promise<{ start: string; end: string }[]> {
  const now = Date.now();
  const { data } = await supabase
    .from("shift")
    .select("id, published, time_entry (id, superseded_at, archived_at)")
    .not("published", "is", null)
    .is("archived_at", null)
    .gte("start_at", new Date(now - 12 * 3600_000).toISOString())
    .lte("start_at", new Date(now + 12 * 3600_000).toISOString());
  return (data ?? []).flatMap((s) => {
    const p = s.published as { employee_id?: string; start_at?: string; end_at?: string } | null;
    const taken = (s.time_entry ?? []).some((t) => !t.superseded_at && !t.archived_at);
    return p?.employee_id === employeeId && p.start_at && p.end_at && !taken
      ? [{ start: p.start_at, end: p.end_at }]
      : [];
  });
}
