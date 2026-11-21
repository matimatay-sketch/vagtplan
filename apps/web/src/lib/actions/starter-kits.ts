"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAgreementDocument, type AgreementRegistry } from "@vagtplan/rules-engine";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { validateDocument } from "@/lib/domain/agreement-edit";
import { addKitVersion, replaceKitVersion, type KitContent } from "@/lib/domain/starter-kit";
import { loadAgreements } from "@/lib/engine";
import { da } from "@/lib/i18n/da";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, type ActionState } from "./state";
import type { CheckResult } from "./agreements";

type Client = Awaited<ReturnType<typeof createClient>>;

async function loadKit(supabase: Client, key: string): Promise<KitContent | null> {
  const { data } = await supabase
    .from("starter_kit")
    .select("content")
    .eq("key", z.string().max(64).parse(key))
    .maybeSingle();
  return (data?.content as unknown as KitContent | undefined) ?? null;
}

async function saveKit(supabase: Client, key: string, content: KitContent) {
  const { error } = await supabase.rpc("platform_save_starter_kit", {
    p_key: key,
    p_content: content as unknown as Json,
  });
  if (!error) revalidatePath("/platform", "layout");
  return error;
}

/** The kit version checked against the law (basis-dk) and the kit's other versions. */
async function checkKitVersion(supabase: Client, key: string, version: number, document: unknown) {
  const kit = await loadKit(supabase, key);
  if (!kit) return null;
  let next: KitContent;
  try {
    next = replaceKitVersion(kit, version, document as object);
  } catch {
    return null;
  }
  const { registry } = await loadAgreements(supabase);
  const reg: AgreementRegistry = { ...registry, [kit.agreement.key]: [] };
  for (const v of next.agreement.versions) {
    if (v.version === version) continue;
    try {
      reg[kit.agreement.key]!.push(parseAgreementDocument(v));
    } catch {
      // A broken sibling is reported when that version is checked.
    }
  }
  const doc = next.agreement.versions.find((v) => v.version === version)!;
  return { next, check: validateDocument(reg, doc) };
}

export async function validateKitVersionAction(
  key: string,
  version: number,
  document: unknown,
): Promise<CheckResult> {
  await requirePlatformAdmin();
  const r = await checkKitVersion(await createClient(), key, version, document);
  return r ? r.check : { ok: false, errors: [da.common.notAllowed], warnings: [] };
}

export async function saveKitVersionAction(
  key: string,
  version: number,
  document: unknown,
): Promise<CheckResult & { message?: string }> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const r = await checkKitVersion(supabase, key, version, document);
  if (!r) return { message: da.common.notAllowed, ok: false, errors: [], warnings: [] };
  if (!r.check.ok) return { ...r.check, message: da.agreements.invalid };
  const error = await saveKit(supabase, key, r.next);
  if (error) return { message: dbErrorMessage(error), ok: false, errors: [], warnings: [] };
  return { ...r.check, ok: true, message: da.starterKits.saved };
}

export async function newKitVersionAction(key: string, validFrom: string): Promise<ActionState> {
  await requirePlatformAdmin();
  if (!isValidIsoDate(validFrom)) return { message: da.validation.invalidDate };
  const supabase = await createClient();
  const kit = await loadKit(supabase, key);
  if (!kit) return { message: da.common.notAllowed };
  let next: KitContent;
  try {
    next = addKitVersion(kit, validFrom);
  } catch {
    return { message: da.starterKits.versionAfterLatest };
  }
  const error = await saveKit(supabase, key, next);
  if (error) return { message: dbErrorMessage(error) };
  return { ok: true, message: da.starterKits.versionCreated };
}

const extrasSchema = z.object({
  supplement_types: z.array(
    z.object({
      name: z.string().trim().min(1).max(100),
      pay_code: z.string().regex(/^[A-Z0-9_]{1,32}$/),
      amount_type: z.enum(["per_hour", "fixed", "percent"]),
      amounts: z.array(
        z.object({
          valid_from: z.string().refine(isValidIsoDate),
          amount: z.number().int().min(0),
        }),
      ),
    }),
  ),
  pay_period_groups: z.array(
    z.object({
      name: z.string().trim().min(1).max(100),
      frequency: z.enum(["weekly", "biweekly"]),
      anchor_date: z.string().refine(isValidIsoDate),
    }),
  ),
});

/** The supplement types (with a rate per date) and pay period groups that come with the kit. */
export async function saveKitExtrasAction(key: string, extras: unknown): Promise<ActionState> {
  await requirePlatformAdmin();
  const parsed = extrasSchema.safeParse(extras);
  if (!parsed.success) return { message: da.starterKits.extrasInvalid };
  const supabase = await createClient();
  const kit = await loadKit(supabase, key);
  if (!kit) return { message: da.common.notAllowed };
  const error = await saveKit(supabase, key, { ...kit, ...parsed.data });
  if (error) return { message: dbErrorMessage(error) };
  return { ok: true, message: da.starterKits.saved };
}
