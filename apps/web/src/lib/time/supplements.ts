import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type SupplementOption = {
  id: string;
  name: string;
  payCode: string;
  employeeSelectable: boolean;
  archived: boolean;
  department_ids: string[];
  agreement_ids: string[];
};

/** The organization's supplement types (archived ones too, so old rows keep their names). */
export async function loadSupplementOptions(
  supabase: Client,
  organizationId: string,
): Promise<SupplementOption[]> {
  const { data } = await supabase
    .from("supplement_type")
    .select("id, name, pay_code, employee_selectable, archived_at, department_ids, agreement_ids")
    .eq("organization_id", organizationId)
    .order("name");
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    payCode: s.pay_code,
    employeeSelectable: s.employee_selectable,
    archived: s.archived_at !== null,
    department_ids: s.department_ids,
    agreement_ids: s.agreement_ids,
  }));
}
