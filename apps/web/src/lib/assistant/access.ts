import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { assistantConfigured } from "./claude";

/** Whether the organization has the assistant on and the server has a key. */
export async function assistantState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: AppContext,
): Promise<{ enabled: boolean; configured: boolean; usable: boolean }> {
  const { data } = await supabase
    .from("organization_settings")
    .select("assistant_enabled")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const enabled = Boolean(data?.assistant_enabled);
  const configured = assistantConfigured();
  return {
    enabled,
    configured,
    usable: enabled && configured && Boolean(ctx.permissions["assistant.use"]),
  };
}
