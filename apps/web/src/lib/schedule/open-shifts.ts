import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OpenShiftRow } from "@/components/shifts/open-shift-list";

type Client = Awaited<ReturnType<typeof createClient>>;

/** The open shifts the signed-in employee can see in the coming weeks, with competence names. */
export async function loadOpenShiftsForMe(
  supabase: Client,
  organizationId: string,
  days = 28,
): Promise<OpenShiftRow[]> {
  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const [{ data }, { data: competences }] = await Promise.all([
    supabase.rpc("open_shifts_for_me", {
      p_organization_id: organizationId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    }),
    supabase.from("competence").select("id, name").eq("organization_id", organizationId),
  ]);
  const name = new Map((competences ?? []).map((c) => [c.id, c.name]));
  return (data ?? []).map((s) => ({
    shiftId: s.shift_id,
    departmentName: s.department_name,
    start: s.start_at,
    end: s.end_at,
    label: s.label,
    required: s.required_competence_ids.map((id) => name.get(id) ?? "?"),
    missing: s.missing_competence_ids.map((id) => name.get(id) ?? "?"),
    requestId: s.request_id,
    requiresApproval: s.requires_approval,
  }));
}
