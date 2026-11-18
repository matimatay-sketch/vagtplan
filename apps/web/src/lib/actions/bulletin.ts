"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, type ActionState } from "./state";

const schema = z.object({
  departmentId: z.guid().nullable(),
  title: z.string().trim().min(1, da.validation.required).max(120, da.validation.tooLong),
  body: z.string().trim().max(4000, da.validation.tooLong),
  pinned: z.boolean(),
  expiresOn: z.iso.date().nullable(),
});

/** A post on the bulletin board (the database checks bulletin.manage for the department). */
export async function createPostAction(input: z.input<typeof schema>): Promise<ActionState> {
  const ctx = await requireContext(["bulletin.manage"]);
  const p = schema.safeParse(input);
  if (!p.success) return { message: p.error.issues[0]?.message ?? da.common.unknownError };
  const supabase = await createClient();
  const { error } = await supabase.from("bulletin_post").insert({
    organization_id: ctx.organization.id,
    department_id: p.data.departmentId,
    title: p.data.title,
    body: p.data.body,
    pinned: p.data.pinned,
    expires_on: p.data.expiresOn,
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath("/oversigt");
  return { ok: true, message: da.dashboard.posted };
}

export async function deletePostAction(id: string): Promise<ActionState> {
  await requireContext(["bulletin.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bulletin_post")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidatePath("/oversigt");
  return { ok: true };
}

export async function setShowCelebrationsAction(show: boolean): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_show_celebrations", {
    p_show: z.boolean().parse(show),
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath("/profil");
  revalidatePath("/oversigt");
  return { ok: true, message: da.common.saved };
}
