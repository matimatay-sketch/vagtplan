import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { IsoDate } from "@/lib/domain/civil-date";
import type { MileageRate } from "@/lib/domain/mileage";

type Client = Awaited<ReturnType<typeof createClient>>;

export type RateRow = MileageRate & { id: string };
export type CategoryRow = {
  id: string;
  name: string;
  payCode: string;
  receiptRequired: boolean;
  archived: boolean;
};
type Decision = {
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  decidedAt: string | null;
};
export type TripRow = Decision & {
  kind: "trip";
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: IsoDate;
  purpose: string;
  from: string;
  to: string;
  stops: string[];
  meters: number;
  vehicle: string | null;
  posting: Record<string, string>;
};
export type ExpenseRow = Decision & {
  kind: "expense";
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: IsoDate;
  categoryId: string;
  categoryName: string;
  description: string;
  amountOre: number;
  hasReceipt: boolean;
  posting: Record<string, string>;
};
export type ExpenseItem = TripRow | ExpenseRow;

export async function loadMileageRates(supabase: Client, organizationId: string) {
  const { data } = await supabase
    .from("mileage_rate")
    .select(
      "id, year, high_rate_ore, low_rate_ore, high_limit_km, pay_code_high, pay_code_low, source",
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("year", { ascending: false });
  return (data ?? []).map((r): RateRow => ({
    id: r.id,
    year: r.year,
    highRateOre: r.high_rate_ore,
    lowRateOre: r.low_rate_ore,
    highLimitKm: r.high_limit_km,
    payCodeHigh: r.pay_code_high,
    payCodeLow: r.pay_code_low,
    source: r.source,
  }));
}

export async function loadExpenseCategories(supabase: Client, organizationId: string) {
  const { data } = await supabase
    .from("expense_category")
    .select("id, name, pay_code, receipt_required, archived_at")
    .eq("organization_id", organizationId)
    .order("name");
  return (data ?? []).map((c): CategoryRow => ({
    id: c.id,
    name: c.name,
    payCode: c.pay_code,
    receiptRequired: c.receipt_required,
    archived: c.archived_at !== null,
  }));
}

const name = (e: { first_name: string; last_name: string } | null) =>
  e ? `${e.first_name} ${e.last_name}`.trim() : "";

/** Trips and expenses the user may see (RLS), by date, not archived. */
export async function loadExpenseItems(
  supabase: Client,
  opts: { from: IsoDate; to: IsoDate; employeeId?: string; status?: "approved" },
): Promise<ExpenseItem[]> {
  let trips = supabase
    .from("mileage_trip")
    .select(
      "id, employee_id, department_id, trip_date, purpose, from_address, to_address, stops, meters, vehicle, posting_values, status, decision_note, decided_at, employee!mileage_trip_organization_id_employee_id_fkey (first_name, last_name)",
    )
    .is("archived_at", null)
    .gte("trip_date", opts.from)
    .lte("trip_date", opts.to);
  let expenses = supabase
    .from("expense")
    .select(
      "id, employee_id, department_id, expense_date, category_id, description, amount_ore, receipt_path, posting_values, status, decision_note, decided_at, employee!expense_organization_id_employee_id_fkey (first_name, last_name), expense_category!expense_organization_id_category_id_fkey (name)",
    )
    .is("archived_at", null)
    .gte("expense_date", opts.from)
    .lte("expense_date", opts.to);
  if (opts.employeeId) {
    trips = trips.eq("employee_id", opts.employeeId);
    expenses = expenses.eq("employee_id", opts.employeeId);
  }
  if (opts.status) {
    trips = trips.eq("status", opts.status);
    expenses = expenses.eq("status", opts.status);
  }
  const [{ data: t }, { data: e }] = await Promise.all([trips, expenses]);
  const items: ExpenseItem[] = [
    ...(t ?? []).map((r): TripRow => ({
      kind: "trip",
      id: r.id,
      employeeId: r.employee_id,
      employeeName: name(r.employee),
      departmentId: r.department_id,
      date: r.trip_date,
      purpose: r.purpose,
      from: r.from_address,
      to: r.to_address,
      stops: (r.stops ?? []) as string[],
      meters: r.meters,
      vehicle: r.vehicle,
      posting: (r.posting_values ?? {}) as Record<string, string>,
      status: r.status as TripRow["status"],
      decisionNote: r.decision_note,
      decidedAt: r.decided_at,
    })),
    ...(e ?? []).map((r): ExpenseRow => ({
      kind: "expense",
      id: r.id,
      employeeId: r.employee_id,
      employeeName: name(r.employee),
      departmentId: r.department_id,
      date: r.expense_date,
      categoryId: r.category_id,
      categoryName: r.expense_category?.name ?? "",
      description: r.description,
      amountOre: r.amount_ore,
      hasReceipt: r.receipt_path !== null,
      posting: (r.posting_values ?? {}) as Record<string, string>,
      status: r.status as ExpenseRow["status"],
      decisionNote: r.decision_note,
      decidedAt: r.decided_at,
    })),
  ];
  return items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.employeeName.localeCompare(b.employeeName, "da") ||
      a.kind.localeCompare(b.kind),
  );
}
