import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Who } from "@/lib/domain/scope";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The employees' departments, the agreements of the contract in force on the
 * date and their employee group, for "Gælder for" (inScope).
 */
export async function loadWho(
  supabase: Client,
  employeeIds: readonly string[],
  date: string,
): Promise<Record<string, Who>> {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return {};
  const out: Record<string, Who> = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from("employee")
      .select(
        "id, employee_group_id, employee_department!employee_department_organization_id_employee_id_fkey (department_id), contract (valid_from, valid_to, agreement_id, local_agreement_id)",
      )
      .in("id", ids.slice(i, i + 150));
    for (const e of data ?? []) {
      const contract = e.contract.find(
        (c) => c.valid_from <= date && (c.valid_to === null || c.valid_to >= date),
      );
      out[e.id] = {
        departmentIds: e.employee_department.map((d) => d.department_id),
        agreementIds: contract
          ? [contract.agreement_id, contract.local_agreement_id].filter((x): x is string => !!x)
          : [],
        groupId: e.employee_group_id,
      };
    }
  }
  return out;
}
