"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  notificationSettingSchema,
  pushDeviceSchemaFor,
  type PushDeviceInput,
} from "@/lib/forms/notifications";
import { env } from "@/lib/env";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, type ActionState } from "./state";

const refresh = () => revalidatePath("/profil");

/** Registers this phone or browser for push notifications. */
export async function registerPushDeviceAction(input: PushDeviceInput): Promise<ActionState> {
  const ctx = await requireContext();
  const parsed = pushDeviceSchemaFor(process.env.WEBHOOK_ALLOW_INSECURE === "1").safeParse(input);
  if (!parsed.success) return { message: da.notifications.deviceInvalid };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_device", {
    p_org: ctx.organization.id,
    p_platform: d.platform,
    p_token: d.token,
    p_keys: d.keys,
    p_label: d.label,
  });
  if (error) return { message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: da.notifications.enabled };
}

/** Turns push off for one of the user's devices. */
export async function removePushDeviceAction(id: string): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_push_device", { p_id: z.guid().parse(id) });
  if (error) return { message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: da.notifications.removed };
}

/** Turns one kind of notification on or off. */
export async function saveNotificationSettingAction(
  kind: string,
  on: boolean,
): Promise<ActionState> {
  const ctx = await requireContext();
  const s = notificationSettingSchema.parse({ kind, on });
  const supabase = await createClient();
  const change: Partial<Record<(typeof s)["kind"], boolean>> = { [s.kind]: s.on };
  const { error } = await supabase.from("notification_setting").upsert(
    {
      organization_id: ctx.organization.id,
      user_id: ctx.userId,
      ...change,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) return { message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: da.notifications.saved };
}

/** A new calendar link (shown once); the previous link stops working. */
export async function createCalendarFeedAction(): Promise<ActionState & { url?: string }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_calendar_feed", {
    p_org: ctx.organization.id,
  });
  if (error || !data) return { message: dbErrorMessage(error) };
  refresh();
  return {
    ok: true,
    message: da.calendarFeed.created,
    url: `${env.siteUrl.replace(/\/$/, "")}/api/kalender/${data}.ics`,
  };
}

/** Stops the calendar link. */
export async function endCalendarFeedAction(): Promise<ActionState> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_calendar_feed", { p_org: ctx.organization.id });
  if (error) return { message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: da.calendarFeed.ended };
}
