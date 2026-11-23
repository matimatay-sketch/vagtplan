"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { substituteSchema } from "@/lib/forms/substitutes";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

function revalidateSubstitutes() {
  revalidatePath("/tid", "layout");
  revalidatePath("/fravaer", "layout");
  revalidatePath("/oversigt");
}

/**
 * Creates or changes a substitute approver. The database checks the right:
 * users.manage, or the absent user appointing their own substitute.
 */
export async function saveSubstituteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["users.manage", "time.approve"]);
  const values = formValues(formData);
  const parsed = substituteSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const id = z.guid().safeParse(values.id).data ?? null;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_approval_substitute", {
    p_org: ctx.organization.id,
    // A null id creates a new substitution (the generated types do not allow null).
    p_id: id as string,
    p_absent: v.absent_user_id,
    p_substitute: v.substitute_user_id,
    p_from: v.valid_from,
    p_to: v.valid_to,
    p_note: v.note,
  });
  if (error)
    return {
      message:
        error.hint === "invalid_period"
          ? da.substitutes.invalidPeriod
          : error.hint === "same_user"
            ? da.substitutes.sameUser
            : dbErrorMessage(error),
      values,
    };
  revalidateSubstitutes();
  return { ok: true, message: id ? da.substitutes.saved : da.substitutes.created };
}

/** Ends a substitution now (kept for the audit trail). */
export async function endSubstituteAction(id: string): Promise<ActionState> {
  await requireContext(["users.manage", "time.approve"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_approval_substitute", { p_id: z.guid().parse(id) });
  if (error) return { message: dbErrorMessage(error) };
  revalidateSubstitutes();
  return { ok: true, message: da.substitutes.ended };
}
