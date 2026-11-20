"use server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { sendWebhooksSoon } from "@/lib/api/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { hasOrg } from "@/lib/permissions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { employeeSchema, fieldErrors } from "@/lib/forms/schemas";
import { todayIn } from "@/lib/domain/civil-date";
import { env } from "@/lib/env";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const numberTaken = { "23505": da.employees.numberTaken };

export async function createEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Events recorded by the database are sent to webhooks after the response.
  sendWebhooksSoon();
  const ctx = await requireContext(["employees.manage"]);
  const values = formValues(formData);
  const parsed = employeeSchema(todayIn(ctx.organization.timezone)).safeParse(values);
  const dept = z.guid().safeParse(values.department_id);
  if (!parsed.success || !dept.success) {
    return {
      errors: {
        ...(parsed.success ? {} : fieldErrors(parsed.error)),
        ...(dept.success ? {} : { department_id: da.validation.required }),
      },
      values,
    };
  }
  const e = parsed.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_employee", {
    p_department_id: dept.data,
    p_employee_number: e.employee_number,
    p_first_name: e.first_name,
    p_last_name: e.last_name,
    p_birth_date: e.birth_date,
    p_email: e.email ?? undefined,
    p_phone: e.phone ?? undefined,
    p_school_obligated: e.school_obligated,
    p_school_obligation_ends_on: e.school_obligation_ends_on ?? undefined,
    p_hired_on: e.hired_on ?? undefined,
  });
  if (error || !id) return { message: dbErrorMessage(error, numberTaken), values };
  revalidatePath("/medarbejdere");
  redirect(`/medarbejdere/${id}?ny=1`);
}

export async function updateEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Events recorded by the database are sent to webhooks after the response.
  sendWebhooksSoon();
  const ctx = await requireContext(["employees.manage"]);
  const values = formValues(formData);
  const id = z.guid().safeParse(values.id);
  const parsed = employeeSchema(todayIn(ctx.organization.timezone)).safeParse(values);
  if (!parsed.success || !id.success)
    return { errors: parsed.success ? {} : fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id");
  if (error) return { message: dbErrorMessage(error, numberTaken), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidatePath(`/medarbejdere/${id.data}`);
  return { ok: true, message: da.common.saved };
}

export async function addEmployeeDepartmentAction(formData: FormData) {
  const ctx = await requireContext(["employees.manage"]);
  const input = z
    .object({ employee_id: z.guid(), department_id: z.guid() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_department")
    .insert({ ...input, organization_id: ctx.organization.id, is_primary: false });
  if (error && error.code !== "23505") throw new Error(dbErrorMessage(error));
  revalidatePath(`/medarbejdere/${input.employee_id}`);
}

export async function removeEmployeeDepartmentAction(formData: FormData) {
  await requireContext(["employees.manage"]);
  const input = z
    .object({ employee_id: z.guid(), department_id: z.guid() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_department")
    .delete()
    .eq("employee_id", input.employee_id)
    .eq("department_id", input.department_id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/medarbejdere/${input.employee_id}`);
}

const inviteSchema = z.object({
  employee_id: z.guid(),
  profile_id: z.guid().optional(),
});

/**
 * Sends an invitation e-mail and links the new auth user to the employee.
 * The service client is used only after the database has confirmed that the
 * caller holds employees.invite for this employee. Choosing a profile other
 * than the organization's default requires users.manage.
 */
export async function inviteEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["employees.invite"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: da.common.unknownError };
  const { employee_id } = parsed.data;

  const supabase = await createClient();
  const [{ data: allowed }, { data: employee }, { data: org }] = await Promise.all([
    supabase.rpc("can_on_employee", { perm: "employees.invite", emp: employee_id }),
    supabase
      .from("employee")
      .select("id, email, user_id, organization_id, login_placeholder")
      .eq("id", employee_id)
      .maybeSingle(),
    supabase
      .from("organization")
      .select("default_profile_id")
      .eq("id", ctx.organization.id)
      .single(),
  ]);
  if (!allowed || !employee) return { message: da.common.notAllowed };
  if (!employee.email) return { message: da.employees.inviteNeedsEmail };
  if (employee.user_id && employee.login_placeholder) {
    // A background login (from "log in as"): it gets the employee's e-mail and a login link.
    const service = createServiceClient();
    const { error: updateError } = await service.auth.admin.updateUserById(employee.user_id, {
      email: employee.email,
      email_confirm: true,
      app_metadata: { turnus_placeholder: false },
    });
    if (updateError) return { message: da.common.unknownError };
    const { error: linkError } = await createPlainClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false },
    }).auth.signInWithOtp({
      email: employee.email,
      options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}/auth/callback` },
    });
    await service.from("employee").update({ login_placeholder: false }).eq("id", employee.id);
    if (linkError) return { message: da.common.unknownError };
    revalidatePath(`/medarbejdere/${employee.id}`);
    return { ok: true, message: da.employees.inviteSent };
  }
  if (employee.user_id) return { message: da.employees.hasLogin };

  let profileId = org?.default_profile_id ?? null;
  if (parsed.data.profile_id && parsed.data.profile_id !== profileId) {
    if (!hasOrg(ctx.permissions, "users.manage")) return { message: da.common.notAllowed };
    const { data: profile } = await supabase
      .from("permission_profile")
      .select("id")
      .eq("id", parsed.data.profile_id)
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!profile) return { message: da.common.notAllowed };
    profileId = profile.id;
  }
  if (!profileId) return { message: da.common.unknownError };

  const service = createServiceClient();
  const { data: invited, error } = await service.auth.admin.inviteUserByEmail(employee.email, {
    redirectTo: `${env.siteUrl}/auth/callback`,
  });
  if (error || !invited.user) return { message: da.common.unknownError };
  const userId = invited.user.id;

  const { error: memberError } = await service
    .from("membership")
    .upsert(
      { organization_id: employee.organization_id, user_id: userId, profile_id: profileId },
      { onConflict: "organization_id,user_id" },
    );
  const { error: linkError } = await service
    .from("employee")
    .update({ user_id: userId })
    .eq("id", employee.id);
  if (memberError || linkError) return { message: da.common.unknownError };

  revalidatePath(`/medarbejdere/${employee.id}`);
  return { ok: true, message: da.employees.inviteSent };
}

/** Sets who approves this employee's time personally ("Godkendes af"). */
export async function setTimeApproverAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["users.manage"]);
  const input = z
    .object({ employee_id: z.guid(), approver_user_id: z.union([z.guid(), z.literal("")]) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee")
    .update({ approver_user_id: input.data.approver_user_id || null })
    .eq("id", input.data.employee_id)
    .select("id");
  if (error) return { message: dbErrorMessage(error, { "23514": da.employees.approverInvalid }) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidatePath(`/medarbejdere/${input.data.employee_id}`);
  revalidatePath("/tid/godkend");
  return { ok: true, message: da.common.saved };
}

/** Makes one of the employee's departments the primary one (the database checks the right). */
export async function setPrimaryDepartmentAction(formData: FormData) {
  await requireContext(["employees.manage"]);
  const input = z
    .object({ employee_id: z.guid(), department_id: z.guid() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_primary_department", {
    p_employee_id: input.employee_id,
    p_department_id: input.department_id,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/medarbejdere/${input.employee_id}`);
  revalidatePath("/medarbejdere");
}

/**
 * Deletes an employee: archived (history is kept) and the login removed.
 * The database refuses while a contract is active, and for administrators.
 */
export async function archiveEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["employees.manage"]);
  const id = z.guid().safeParse(formData.get("employee_id"));
  if (!id.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_employee", { p_id: id.data });
  if (error)
    return {
      message:
        error.code === "P0001" && error.hint
          ? (da.employees.archiveRefused[error.hint as keyof typeof da.employees.archiveRefused] ??
            dbErrorMessage(error))
          : dbErrorMessage(error),
    };
  revalidatePath("/medarbejdere");
  redirect("/medarbejdere");
}
