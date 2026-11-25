import type { DeviationReason } from "@/lib/domain/deviation";
import { inScope, type Who } from "@/lib/domain/scope";

export type ReasonOption = Pick<DeviationReason, "id" | "name" | "applies_to"> & {
  department_ids: string[];
  agreement_ids: string[];
  employee_group_ids: string[];
};
/**
 * The organization's deviation reasons in use, the threshold for asking
 * (minutes) and, for "Gælder for", who the employees in question are.
 */
export type DeviationContext = {
  reasons: ReasonOption[];
  thresholdMinutes: number;
  who: Record<string, Who>;
};

/** The reasons that apply to an employee (all, when the employee is not known). */
export function reasonsForEmployee(
  deviation: DeviationContext,
  employeeId: string | null | undefined,
): ReasonOption[] {
  const who = employeeId ? deviation.who[employeeId] : undefined;
  return who ? deviation.reasons.filter((r) => inScope(r, who)) : deviation.reasons;
}
