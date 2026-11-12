"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
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
  const ctx = await requireContext(["admin", "manager"]);
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
  const ctx = await requireContext(["admin", "manager"]);
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
  const ctx = await requireContext(["admin", "manager"]);
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
  await requireContext(["admin", "manager"]);
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
  role: z.enum(["employee", "manager", "admin"]),
});

/**
 * Sends an invitation e-mail and links the new auth user to the employee.
 * Uses the service client only after the caller's own RLS-scoped client has
 * proven they can manage this employee.
 */
export async function inviteEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["admin", "manager"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: da.common.unknownError };
  const { employee_id, role } = parsed.data;
  if (role !== "employee" && ctx.role !== "admin") return { message: da.common.notAllowed };

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employee")
    .select("id, email, user_id, organization_id")
    .eq("id", employee_id)
    .maybeSingle();
  if (!employee) return { message: da.common.notAllowed };
  if (!employee.email) return { message: da.employees.inviteNeedsEmail };
  if (employee.user_id) return { message: da.employees.hasLogin };

  const service = createServiceClient();
  const { data: invited, error } = await service.auth.admin.inviteUserByEmail(employee.email, {
    redirectTo: `${env.siteUrl}/auth/callback`,
  });
  if (error || !invited.user) return { message: da.common.unknownError };
  const userId = invited.user.id;

  const { error: memberError } = await service
    .from("membership")
    .upsert(
      { organization_id: employee.organization_id, user_id: userId, role },
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
