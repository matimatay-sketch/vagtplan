"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendWebhooksSoon } from "@/lib/api/notify";
import { IMPORT_KINDS } from "@/lib/domain/csv-import";
import { planImport, type ImportPlan } from "@/lib/import/plan";
import { IMPORT_PERMISSION, MAX_IMPORT_BYTES } from "@/lib/import/kinds";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage } from "./state";

const input = z.object({
  kind: z.enum(IMPORT_KINDS),
  text: z.string().max(MAX_IMPORT_BYTES),
  balanceMode: z.enum(["set", "adjust"]).default("set"),
});
export type ImportInput = z.input<typeof input>;
export type ImportPreview = Omit<ImportPlan, "payload"> | { error: string };

/** What the file will do, line by line. Nothing is saved. */
export async function previewImportAction(raw: ImportInput): Promise<ImportPreview> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: da.importCsv.fileTooBig };
  const { kind, text, balanceMode } = parsed.data;
  const ctx = await requireContext([IMPORT_PERMISSION[kind]]);
  const { payload: _payload, ...plan } = await planImport(await createClient(), ctx, kind, text, {
    balanceMode,
  });
  return plan;
}

/**
 * Imports the file: the plan is made again on the server (never trusted from
 * the browser), and only a file without errors is written, all in one
 * transaction.
 */
export async function commitImportAction(
  raw: ImportInput,
): Promise<{ ok: true; message: string; count: number } | { ok: false; message: string }> {
  const t = da.importCsv;
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: t.fileTooBig };
  const { kind, text, balanceMode } = parsed.data;
  const ctx = await requireContext([IMPORT_PERMISSION[kind]]);
  const supabase = await createClient();
  const plan = await planImport(supabase, ctx, kind, text, { balanceMode });
  const blocked =
    plan.fatal ||
    plan.problems.some((p) => p.line > 1) ||
    plan.rows.some((r) => r.action === "error");
  if (blocked) return { ok: false, message: t.fixFirst };
  if (plan.payload.length === 0) return { ok: false, message: t.nothingToDo };
  const fn = {
    departments: "import_departments",
    employees: "import_employees",
    shifts: "import_shifts",
    balances: "import_balances",
  } as const;
  const { data, error } = await supabase.rpc(fn[kind], {
    p_org: ctx.organization.id,
    p_rows: plan.payload as never,
  });
  if (error) {
    const line = /import_line:(\d+)/.exec(error.hint ?? "")?.[1] ?? "?";
    return { ok: false, message: t.failedAt(line, dbErrorMessage(error)) };
  }
  // Employee changes are webhook events.
  if (kind === "employees") sendWebhooksSoon();
  for (const path of ["/medarbejdere", "/afdelinger", "/vagtplan", "/fravaer/godkend", "/fravaer"])
    revalidatePath(path, "layout");
  const count = data ?? plan.payload.length;
  return {
    ok: true,
    count,
    message: t.done(count) + (kind === "shifts" ? ` ${t.doneShifts}` : ""),
  };
}
