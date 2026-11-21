"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import {
  cancellationSchema,
  editMessageSchema,
  newMessageSchema,
  replySchema,
  swapDecisionSchema,
  swapSchema,
} from "@/lib/forms/messages";
import { RULE_CATALOG } from "@/lib/schedule/rule-handling";
import { swapViolations } from "@/lib/messages/swap-check";
import { sendEmailsSoon } from "@/lib/messages/email";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

/** Danish messages for the hints the message functions raise. */
function hintMessage(error: { code?: string; hint?: string } | null): string | undefined {
  switch (error?.hint) {
    case "recipient":
      return da.messages.recipientNotAllowed;
    case "shift_not_swappable":
      return da.swap.notSwappable;
    case "already_offered":
      return da.swap.alreadyOffered;
    case "target_not_allowed":
      return da.swap.targetNotAllowed;
    case "swap_closed":
      return da.swap.closed;
    case "shift_changed":
      return da.swap.shiftChanged;
    case "already_reported":
      return da.cancellation.already;
    case "cancellation_closed":
      return da.cancellation.closed;
    default:
      return undefined;
  }
}
const errorText = (error: { code?: string; hint?: string; message?: string } | null) =>
  hintMessage(error) ?? dbErrorMessage(error);

function refresh() {
  revalidatePath("/beskeder", "layout");
  revalidatePath("/min-vagtplan");
  revalidatePath("/vagtplan");
  revalidatePath("/oversigt");
  sendEmailsSoon();
}

export async function startConversationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  const parsed = newMessageSchema.safeParse({
    to: formData.getAll("to").filter((x) => typeof x === "string" && x),
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    p_org: ctx.organization.id,
    p_user_ids: parsed.data.to,
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
  });
  if (error || !data) return { message: errorText(error), values };
  refresh();
  redirect(`/beskeder/${data}`);
}

export async function replyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  const parsed = replySchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase.from("message").insert({
    organization_id: ctx.organization.id,
    conversation_id: parsed.data.conversation_id,
    body: parsed.data.body,
  });
  if (error) return { message: errorText(error), values };
  await markRead(parsed.data.conversation_id);
  refresh();
  return { ok: true };
}

export async function editMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const values = formValues(formData);
  const parsed = editMessageSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { message: errorText(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  refresh();
  return { ok: true, message: da.common.saved };
}

/** Deletes one's own message (it stays as "Beskeden er slettet"). */
export async function deleteMessageAction(id: string): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: errorText(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  refresh();
  return { ok: true };
}

async function markRead(conversationId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("conversation_participant")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", ctx.userId);
}

/** Called by the conversation page when it shows unread messages. */
export async function markReadAction(conversationId: string) {
  await markRead(z.guid().parse(conversationId));
  revalidatePath("/beskeder", "layout");
}

export async function hideConversationAction(formData: FormData) {
  const ctx = await requireContext();
  const id = z.guid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("conversation_participant")
    .update({ archived_at: new Date().toISOString(), last_read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .eq("user_id", ctx.userId);
  revalidatePath("/beskeder", "layout");
  redirect("/beskeder");
}

// ---------------------------------------------------------------------------
// Shift swaps
// ---------------------------------------------------------------------------
export async function proposeSwapAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const values = formValues(formData);
  const parsed = swapSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase.rpc("propose_shift_swap", {
    p_shift_id: parsed.data.shift_id,
    p_target_employee_id: parsed.data.target_employee_id,
    p_target_shift_id: parsed.data.target_shift_id as string,
    p_note: parsed.data.note,
  });
  if (error) return { message: errorText(error), values };
  refresh();
  return { ok: true, message: da.swap.sent };
}

const ruleLabel = (code: string, message: string) =>
  RULE_CATALOG.find((r) => r.code === code)?.label ?? message;

/**
 * Answers a swap. Accepting and approving move shifts, so the rules are checked
 * for both employees first and the swap is then executed with the service role
 * (the database checks the actor again).
 */
export async function swapDecisionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const parsed = swapDecisionSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: da.common.unknownError };
  const { id, decision, note } = parsed.data;
  const supabase = await createClient();

  if (decision === "decline" || decision === "cancel" || decision === "reject") {
    const { error } = await supabase.rpc("close_shift_swap", {
      p_id: id,
      p_action: decision,
      p_note: note,
    });
    if (error) return { message: errorText(error) };
    refresh();
    return { ok: true, message: da.swap.closedMsg };
  }

  // The database decides whether the actor takes part (RLS + flags).
  const { data: details } = await supabase.rpc("swap_details", { p_ids: [id] });
  const d = details?.[0];
  if (!d) return { message: da.common.notAllowed };
  if (decision === "accept" ? !d.is_target : !d.can_decide)
    return { message: da.common.notAllowed };
  if (decision === "accept" ? d.status !== "proposed" : d.status !== "accepted")
    return { message: da.swap.closed };

  const db = createServiceClient();
  const broken = await swapViolations(db, id, ctx.organization.timezone);
  if (broken.length) {
    const list = [...new Set(broken.map((v) => ruleLabel(v.code, v.message)))].join(", ");
    return { message: da.swap.rulesBroken(list) };
  }
  if (decision === "accept") {
    const { data, error } = await db.rpc("accept_shift_swap", { p_actor: ctx.userId, p_id: id });
    if (error) return { message: errorText(error) };
    refresh();
    return { ok: true, message: data === "accepted" ? da.swap.acceptedMsg : da.swap.completedMsg };
  }
  const { error } = await db.rpc("approve_shift_swap", {
    p_actor: ctx.userId,
    p_id: id,
    p_note: note,
  });
  if (error) return { message: errorText(error) };
  refresh();
  return { ok: true, message: da.swap.completedMsg };
}

// ---------------------------------------------------------------------------
// Afbud
// ---------------------------------------------------------------------------
export async function reportCancellationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const values = formValues(formData);
  const parsed = cancellationSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_shift_cancellation", {
    p_shift_id: parsed.data.shift_id,
    p_reason: parsed.data.reason,
  });
  if (error)
    return {
      message: error.hint === "shift_not_swappable" ? da.cancellation.notYours : errorText(error),
      values,
    };
  refresh();
  return { ok: true, message: da.cancellation.sent };
}

export async function closeCancellationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const input = z
    .object({ id: z.guid(), action: z.enum(["withdraw", "resolve"]) })
    .safeParse(formValues(formData));
  if (!input.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_shift_cancellation", {
    p_id: input.data.id,
    p_action: input.data.action,
  });
  if (error) return { message: errorText(error) };
  refresh();
  return {
    ok: true,
    message:
      input.data.action === "withdraw" ? da.cancellation.withdrawnMsg : da.cancellation.resolvedMsg,
  };
}
