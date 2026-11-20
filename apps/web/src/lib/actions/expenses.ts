"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  expenseCategorySchema,
  expenseSchema,
  mileageRateSchema,
  tripSchema,
} from "@/lib/forms/expenses";
import { da } from "@/lib/i18n/da";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const t = da.expenses;

function revalidateExpenses() {
  revalidatePath("/koersel", "layout");
  revalidatePath("/indstillinger/koersel");
  revalidatePath("/tid/godkend");
}

// --- Setup (expenses.manage) ---------------------------------------------

export async function saveMileageRateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["expenses.manage"]);
  const values = formValues(formData);
  const parsed = mileageRateSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const r = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("mileage_rate").insert({
    organization_id: ctx.organization.id,
    year: r.year,
    high_rate_ore: r.high_rate,
    low_rate_ore: r.low_rate,
    high_limit_km: r.high_limit_km,
    pay_code_high: r.pay_code_high,
    pay_code_low: r.pay_code_low,
    source: r.source,
  });
  if (error) return { message: dbErrorMessage(error, { "23505": t.yearTaken }), values };
  revalidateExpenses();
  return { ok: true, message: da.common.saved };
}

export async function saveExpenseCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["expenses.manage"]);
  const values = formValues(formData);
  const parsed = expenseCategorySchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_category")
    .insert({ ...parsed.data, organization_id: ctx.organization.id });
  if (error) return { message: dbErrorMessage(error, { "23505": t.categoryTaken }), values };
  revalidateExpenses();
  return { ok: true, message: da.common.saved };
}

/** Archives a rate year or a category (kept for history). */
export async function archiveExpenseSetupAction(formData: FormData) {
  await requireContext(["expenses.manage"]);
  const table = z.enum(["mileage_rate", "expense_category"]).parse(formData.get("table"));
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidateExpenses();
}

// --- The employee's own trips and expenses -------------------------------

async function ownDepartment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
) {
  const { data } = await supabase
    .from("employee_department")
    .select("department_id, is_primary")
    .eq("employee_id", employeeId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.department_id ?? null;
}

export async function saveTripAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  if (!ctx.employee) return { message: da.common.notAllowed, values };
  const parsed = tripSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  const supabase = await createClient();
  const row = {
    trip_date: f.trip_date,
    purpose: f.purpose,
    from_address: f.from_address,
    to_address: f.to_address,
    stops: f.stops as NonNullable<Json>,
    meters: f.km,
    vehicle: f.vehicle,
    posting_values: f.posting as NonNullable<Json>,
  };
  if (f.id) {
    const { data, error } = await supabase
      .from("mileage_trip")
      .update(row)
      .eq("id", f.id)
      .select("id");
    if (error) return { message: dbErrorMessage(error), values };
    if (!data?.length) return { message: da.common.notAllowed, values };
  } else {
    const departmentId = await ownDepartment(supabase, ctx.employee.id);
    if (!departmentId) return { message: da.common.notAllowed, values };
    const { error } = await supabase.from("mileage_trip").insert({
      ...row,
      organization_id: ctx.organization.id,
      employee_id: ctx.employee.id,
      department_id: departmentId,
    });
    if (error) return { message: dbErrorMessage(error), values };
  }
  revalidateExpenses();
  return { ok: true, message: t.tripSaved };
}

export async function saveExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  if (!ctx.employee) return { message: da.common.notAllowed, values };
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  const supabase = await createClient();

  // The receipt is stored with the user's own session: storage RLS checks the folder.
  const file = formData.get("receipt");
  let receiptPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!(RECEIPT_TYPES as readonly string[]).includes(file.type))
      return { errors: { receipt: t.receiptType }, values };
    if (file.size > RECEIPT_MAX_BYTES) return { errors: { receipt: t.receiptSize }, values };
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    receiptPath = `${ctx.organization.id}/${ctx.employee.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("receipts")
      .upload(receiptPath, file, { contentType: file.type });
    if (error) return { message: t.receiptFailed, values };
  }

  const row = {
    expense_date: f.expense_date,
    category_id: f.category_id,
    description: f.description,
    amount_ore: f.amount,
    posting_values: f.posting as NonNullable<Json>,
    ...(receiptPath ? { receipt_path: receiptPath } : {}),
  };
  if (f.id) {
    const { data, error } = await supabase.from("expense").update(row).eq("id", f.id).select("id");
    if (error) return { message: dbErrorMessage(error, { "23514": t.receiptRequired }), values };
    if (!data?.length) return { message: da.common.notAllowed, values };
  } else {
    const departmentId = await ownDepartment(supabase, ctx.employee.id);
    if (!departmentId) return { message: da.common.notAllowed, values };
    const { error } = await supabase.from("expense").insert({
      ...row,
      organization_id: ctx.organization.id,
      employee_id: ctx.employee.id,
      department_id: departmentId,
    });
    if (error) return { message: dbErrorMessage(error, { "23514": t.receiptRequired }), values };
  }
  revalidateExpenses();
  return { ok: true, message: t.expenseSaved };
}

/** Removes a pending trip or expense (kept in the audit log). */
export async function archiveExpenseItemAction(
  kind: "trip" | "expense",
  id: string,
): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(z.enum(["trip", "expense"]).parse(kind) === "trip" ? "mileage_trip" : "expense")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .eq("status", "pending")
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateExpenses();
  return { ok: true };
}

/** Approve or reject; the database checks the approver (as for time). */
export async function decideExpenseItemsAction(input: {
  tripIds: string[];
  expenseIds: string[];
  decision: "approved" | "rejected";
  note?: string;
}): Promise<ActionState> {
  await requireContext();
  const p = z
    .object({
      tripIds: z.array(z.guid()).max(500),
      expenseIds: z.array(z.guid()).max(500),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().max(500).optional(),
    })
    .parse(input);
  if (p.decision === "rejected" && (p.note ?? "").trim().length < 3)
    return { message: t.rejectReason };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_expense_items", {
    p_trip_ids: p.tripIds,
    p_expense_ids: p.expenseIds,
    p_decision: p.decision,
    p_note: p.note ?? undefined,
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidateExpenses();
  return {
    ok: true,
    message: p.decision === "approved" ? t.approvedCount(data ?? 0) : t.rejectedCount(data ?? 0),
  };
}

/** Undo a decision: the items wait for approval again (not in a closed pay period). */
export async function reopenExpenseItemsAction(input: {
  tripIds: string[];
  expenseIds: string[];
}): Promise<ActionState> {
  await requireContext();
  const p = z
    .object({ tripIds: z.array(z.guid()).max(500), expenseIds: z.array(z.guid()).max(500) })
    .parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reopen_expense_items", {
    p_trip_ids: p.tripIds,
    p_expense_ids: p.expenseIds,
  });
  if (error)
    return {
      message: error.hint === "period_closed" ? da.time.periodClosed : dbErrorMessage(error),
    };
  revalidateExpenses();
  return { ok: true, message: t.reopenedCount(data ?? 0) };
}
