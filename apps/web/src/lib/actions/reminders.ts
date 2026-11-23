"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { reminderRuleSchema } from "@/lib/forms/reminders";
import { sendEmailsSoon } from "@/lib/messages/email";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const PATH = "/tid/godkend/paamindelser";

/** Creates or changes a reminder rule (RLS checks reminders.manage for its departments). */
export async function saveReminderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["reminders.manage"]);
  const values = formValues(formData);
  const parsed = reminderRuleSchema.safeParse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const id = z.guid().safeParse(values.id).data;
  const supabase = await createClient();
  const row = { ...parsed.data, organization_id: ctx.organization.id };
  const { data, error } = id
    ? await supabase.from("reminder_rule").update(row).eq("id", id).select("id")
    : await supabase.from("reminder_rule").insert(row).select("id");
  if (error) return { message: dbErrorMessage(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidatePath(PATH);
  return { ok: true, message: id ? da.reminders.saved : da.reminders.created };
}

export async function archiveReminderAction(id: string): Promise<ActionState> {
  await requireContext(["reminders.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_rule")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidatePath(PATH);
  return { ok: true, message: da.reminders.archived };
}

/** Who would get the reminder now, and how many things each is reminded of. */
export async function previewReminderAction(
  id: string,
): Promise<{ ok: boolean; message?: string; recipients: { name: string; items: number }[] }> {
  await requireContext(["reminders.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_reminders", {
    p_rule_id: z.guid().parse(id),
    p_send: false,
  });
  if (error) return { ok: false, message: dbErrorMessage(error), recipients: [] };
  return { ok: true, recipients: (data ?? []).map((r) => ({ name: r.name, items: r.items })) };
}

/** Sends the reminder now: messages in Turnus and e-mails. */
export async function sendReminderAction(id: string): Promise<ActionState> {
  await requireContext(["reminders.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_reminders", {
    p_rule_id: z.guid().parse(id),
    p_send: true,
  });
  if (error) return { message: dbErrorMessage(error) };
  sendEmailsSoon();
  revalidatePath(PATH);
  revalidatePath("/beskeder", "layout");
  return { ok: true, message: da.reminders.sent(data?.length ?? 0) };
}
