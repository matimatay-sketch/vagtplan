"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAgreementDocument } from "@vagtplan/rules-engine";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { testCaseSchema } from "@/lib/forms/test-week";
import { registryWith } from "@/lib/domain/agreement-edit";
import { loadAgreements } from "@/lib/engine";
import { da } from "@/lib/i18n/da";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, type ActionState } from "./state";
import { run, runTestWeeks, type TestRun } from "@/lib/agreements/test-weeks";
export type { TestRun, TestWeekResult } from "@/lib/agreements/test-weeks";

export async function runTestWeeksAction(agreementId: string) {
  const ctx = await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  return runTestWeeks(supabase, ctx.organization.timezone, z.guid().parse(agreementId));
}

export async function saveTestWeekAction(
  agreementId: string,
  id: string | null,
  input: unknown,
): Promise<ActionState & { id?: string }> {
  const ctx = await requireContext(["agreements.manage"]);
  const parsed = testCaseSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { message: i ? `${i.path.join(".")}: ${i.message}` : da.common.unknownError };
  }
  const supabase = await createClient();
  const row = { name: parsed.data.name, test: parsed.data as unknown as NonNullable<Json> };
  const { data, error } = id
    ? await supabase
        .from("agreement_test_case")
        .update(row)
        .eq("id", z.guid().parse(id))
        .select("id")
        .single()
    : await supabase
        .from("agreement_test_case")
        .insert({
          ...row,
          organization_id: ctx.organization.id,
          agreement_id: z.guid().parse(agreementId),
        })
        .select("id")
        .single();
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath(`/indstillinger/overenskomster/${agreementId}`);
  return { ok: true, message: da.testWeeks.saved, id: data.id };
}

export async function archiveTestWeekAction(agreementId: string, id: string): Promise<ActionState> {
  await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("agreement_test_case")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id));
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath(`/indstillinger/overenskomster/${agreementId}`);
  return { ok: true, message: da.testWeeks.archived };
}

/** The current calculation of a test week being written (only as help, never as the expectation). */
export async function previewTestWeekAction(agreementId: string, input: unknown): Promise<TestRun> {
  const ctx = await requireContext(["agreements.manage"]);
  const parsed = testCaseSchema.safeParse({
    ...(input as object),
    expected: { lines: [], violations: ["X"] },
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? da.common.unknownError };
  const supabase = await createClient();
  const [{ data: agreement }, { registry }] = await Promise.all([
    supabase
      .from("agreement")
      .select("key, agreement_version (status, document)")
      .eq("id", z.guid().parse(agreementId))
      .maybeSingle(),
    loadAgreements(supabase),
  ]);
  if (!agreement) return { error: da.common.notAllowed };
  const draft = agreement.agreement_version.find((v) => v.status === "draft");
  let reg = registry;
  try {
    if (draft) reg = registryWith(registry, parseAgreementDocument(draft.document));
  } catch {
    reg = registry;
  }
  return run(
    reg,
    agreement.key,
    { ...parsed.data, expected: { lines: [], violations: [] } },
    ctx.organization.timezone,
  );
}
