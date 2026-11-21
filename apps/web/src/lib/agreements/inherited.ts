import "server-only";
import { versionOn } from "@vagtplan/rules-engine";
import { loadAgreements } from "@/lib/engine";
import { inheritedRules, type InheritedRule } from "@/lib/domain/schema-form";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** The rules a document inherits (by id) and the parent's name, for the editor. */
export async function inheritanceFor(
  supabase: Client,
  doc: { inherits_from?: string | null; valid_from: string },
): Promise<{ inherited: Record<string, InheritedRule>; inheritedName?: string }> {
  if (!doc.inherits_from) return { inherited: {} };
  const { registry } = await loadAgreements(supabase);
  let inheritedName: string | undefined;
  try {
    inheritedName = versionOn(registry, doc.inherits_from, doc.valid_from).name;
  } catch {
    inheritedName = undefined;
  }
  return { inherited: inheritedRules(registry, doc), inheritedName };
}
