"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { API_SCOPES, WEBHOOK_EVENTS, isAllowedWebhookUrl } from "@/lib/domain/api";
import { generateApiKey, generateWebhookSecret } from "@/lib/api/crypto";
import { sendWebhooksSoon } from "@/lib/api/notify";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage } from "./state";

const t = da.integrations;
const revalidate = () => revalidatePath("/indstillinger/integrationer");

export type SecretResult = { ok: true; secret: string } | { ok: false; message: string };

/** Creates an API key; the key itself is returned once and never stored. */
export async function createApiKeyAction(input: {
  name: string;
  scopes: string[];
}): Promise<SecretResult> {
  const ctx = await requireContext(["integrations.manage"]);
  const p = z
    .object({
      name: z.string().trim().min(1).max(80),
      scopes: z.array(z.enum(API_SCOPES.map((s) => s.key))).min(1),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: t.keyInvalid };
  const key = generateApiKey();
  const supabase = await createClient();
  const { error } = await supabase.from("api_key").insert({
    organization_id: ctx.organization.id,
    name: p.data.name,
    prefix: key.prefix,
    key_hash: key.hash,
    scopes: [...new Set(p.data.scopes)],
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidate();
  return { ok: true, secret: key.key };
}

export async function revokeApiKeyAction(id: string) {
  await requireContext(["integrations.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_key")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .is("revoked_at", null);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

/** Adds a webhook endpoint; the signing secret is returned once. */
export async function createWebhookAction(input: {
  url: string;
  description: string;
  events: string[];
}): Promise<SecretResult> {
  const ctx = await requireContext(["integrations.manage"]);
  const p = z
    .object({
      url: z.string().trim().max(500),
      description: z.string().trim().max(200),
      events: z.array(z.enum(WEBHOOK_EVENTS.map((e) => e.key))).min(1),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: t.webhookInvalid };
  if (!isAllowedWebhookUrl(p.data.url, process.env.WEBHOOK_ALLOW_INSECURE === "1"))
    return { ok: false, message: t.urlInvalid };
  const secret = generateWebhookSecret();
  const supabase = await createClient();
  const { error } = await supabase.from("webhook_endpoint").insert({
    organization_id: ctx.organization.id,
    url: p.data.url,
    description: p.data.description || null,
    events: [...new Set(p.data.events)],
    secret,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidate();
  return { ok: true, secret };
}

export async function disableWebhookAction(id: string) {
  await requireContext(["integrations.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("webhook_endpoint")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id));
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

/** Sends a ping event to the endpoint. */
export async function pingWebhookAction(id: string) {
  await requireContext(["integrations.manage"]);
  sendWebhooksSoon();
  const supabase = await createClient();
  const { error } = await supabase.rpc("webhook_ping", { p_endpoint_id: z.guid().parse(id) });
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}
