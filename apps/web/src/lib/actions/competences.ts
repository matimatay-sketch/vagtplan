"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/forms/expenses";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const t = da.competences;
const date = z.string().refine(isValidIsoDate, da.validation.invalidDate);

const schema = z
  .object({
    employee_id: z.guid(),
    competence_id: z.guid(da.validation.required),
    valid_from: date,
    valid_to: z
      .string()
      .nullish()
      .transform((s) => s || null)
      .refine((s) => s === null || isValidIsoDate(s), da.validation.invalidDate),
  })
  .refine((v) => !v.valid_to || v.valid_to >= v.valid_from, {
    path: ["valid_to"],
    message: da.validation.endBeforeStart,
  });

/** Gives an employee a competence, optionally with the certificate (RLS: employees.manage). */
export async function addEmployeeCompetenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["employees.manage"]);
  const values = formValues(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success)
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      values,
    };
  const f = parsed.data;
  const supabase = await createClient();
  const file = formData.get("certificate");
  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!(RECEIPT_TYPES as readonly string[]).includes(file.type))
      return { errors: { certificate: da.expenses.receiptType }, values };
    if (file.size > RECEIPT_MAX_BYTES)
      return { errors: { certificate: da.expenses.receiptSize }, values };
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    path = `${ctx.organization.id}/${f.employee_id}/${crypto.randomUUID()}.${ext}`;
    // Uploaded with the user's own session: storage RLS checks employees.manage.
    const { error } = await supabase.storage
      .from("certificates")
      .upload(path, file, { contentType: file.type });
    if (error) return { message: da.expenses.receiptFailed, values };
  }
  const { error } = await supabase.from("employee_competence").insert({
    organization_id: ctx.organization.id,
    employee_id: f.employee_id,
    competence_id: f.competence_id,
    valid_from: f.valid_from,
    valid_to: f.valid_to,
    document_path: path,
  });
  if (error) return { message: dbErrorMessage(error), values };
  revalidatePath(`/medarbejdere/${f.employee_id}`);
  return { ok: true, message: t.added };
}

export async function removeEmployeeCompetenceAction(id: string): Promise<ActionState> {
  await requireContext(["employees.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_competence")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("employee_id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidatePath(`/medarbejdere/${data[0]!.employee_id}`);
  return { ok: true, message: da.common.saved };
}
