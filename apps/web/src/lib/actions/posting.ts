"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, type ActionState } from "./state";

const t = da.posting;
const taken = { "23505": da.common.unknownError };

function revalidatePosting() {
  revalidatePath("/indstillinger/kontering");
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/tid", "layout");
}

const dimensionSchema = z.object({
  id: z.guid().nullish(),
  name: z.string().trim().min(1, da.validation.required).max(80),
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_]{0,39}$/, t.keyInvalid),
  required: z.boolean(),
});

export async function saveDimensionAction(input: unknown): Promise<ActionState> {
  const ctx = await requireContext(["posting.manage"]);
  const p = dimensionSchema.safeParse(input);
  if (!p.success) return { message: p.error.issues[0]?.message ?? da.common.unknownError };
  const supabase = await createClient();
  const { id, ...fields } = p.data;
  const { error } = id
    ? await supabase.from("posting_dimension").update(fields).eq("id", id)
    : await supabase
        .from("posting_dimension")
        .insert({ ...fields, organization_id: ctx.organization.id });
  if (error) return { message: dbErrorMessage(error, taken) };
  revalidatePosting();
  return { ok: true, message: t.saved };
}

const valueSchema = z.object({
  id: z.guid().nullish(),
  dimension_id: z.guid(),
  code: z.string().trim().min(1, da.validation.required).max(40),
  name: z.string().trim().min(1, da.validation.required).max(120),
  department_ids: z.array(z.guid()).max(200),
});

export async function saveValueAction(input: unknown): Promise<ActionState> {
  const ctx = await requireContext(["posting.manage"]);
  const p = valueSchema.safeParse(input);
  if (!p.success) return { message: p.error.issues[0]?.message ?? da.common.unknownError };
  const supabase = await createClient();
  const { id, department_ids, ...fields } = p.data;
  let valueId = id ?? null;
  if (valueId) {
    const { error } = await supabase
      .from("posting_value")
      .update({ code: fields.code, name: fields.name })
      .eq("id", valueId);
    if (error) return { message: dbErrorMessage(error, taken) };
  } else {
    const { data, error } = await supabase
      .from("posting_value")
      .insert({ ...fields, organization_id: ctx.organization.id })
      .select("id")
      .single();
    if (error) return { message: dbErrorMessage(error, taken) };
    valueId = data.id;
  }
  // Department limit: link rows are configuration (audited), changed as a diff.
  const { data: current } = await supabase
    .from("posting_value_department")
    .select("department_id")
    .eq("value_id", valueId);
  const have = new Set((current ?? []).map((r) => r.department_id));
  const want = new Set(department_ids);
  const removed = [...have].filter((d) => !want.has(d));
  const added = [...want].filter((d) => !have.has(d));
  if (removed.length) {
    const { error } = await supabase
      .from("posting_value_department")
      .delete()
      .eq("value_id", valueId)
      .in("department_id", removed);
    if (error) return { message: dbErrorMessage(error) };
  }
  if (added.length) {
    const { error } = await supabase.from("posting_value_department").insert(
      added.map((department_id) => ({
        organization_id: ctx.organization.id,
        value_id: valueId!,
        department_id,
      })),
    );
    if (error) return { message: dbErrorMessage(error) };
  }
  revalidatePosting();
  return { ok: true, message: t.saved };
}

export async function archivePostingAction(
  table: "posting_dimension" | "posting_value",
  id: string,
): Promise<ActionState> {
  await requireContext(["posting.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from(z.enum(["posting_dimension", "posting_value"]).parse(table))
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id));
  if (error) return { message: dbErrorMessage(error) };
  revalidatePosting();
  return { ok: true, message: t.archived };
}

const defaultsSchema = z.record(z.guid(), z.guid());

/** Standard posting of a department (departments.manage) or an employee (employees.manage); RLS decides. */
export async function saveDefaultsAction(
  kind: "department" | "employee",
  id: string,
  values: unknown,
): Promise<ActionState> {
  await requireContext(kind === "department" ? ["departments.manage"] : ["employees.manage"]);
  const parsed = defaultsSchema.safeParse(values);
  if (!parsed.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(kind)
    .update({ posting_defaults: parsed.data as unknown as NonNullable<Json> })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidatePath(kind === "department" ? "/afdelinger" : `/medarbejdere/${id}`);
  revalidatePosting();
  return { ok: true, message: t.saved };
}
