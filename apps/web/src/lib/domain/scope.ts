/**
 * "Gælder for": a deviation reason or a supplement type limited to
 * departments, agreements and employee groups. An empty list means all, and
 * every list that is filled in must match. The same rule as
 * `private.in_scope` in the database.
 */
export type Scope = {
  department_ids: readonly string[];
  agreement_ids: readonly string[];
  employee_group_ids?: readonly string[];
};

/**
 * Who is asking: the departments in question (the shift's, or all the
 * employee's), the agreements of the contract (agreement and local agreement)
 * and the employee group. null/undefined = unknown, not checked.
 */
export type Who = {
  departmentIds: readonly string[] | null;
  agreementIds: readonly string[] | null;
  groupId: string | null | undefined;
};

export function inScope(scope: Scope, who: Who): boolean {
  const some = (list: readonly string[], have: readonly string[]) =>
    have.some((x) => list.includes(x));
  if (
    scope.department_ids.length &&
    who.departmentIds &&
    !some(scope.department_ids, who.departmentIds)
  )
    return false;
  if (
    scope.agreement_ids.length &&
    who.agreementIds &&
    !some(scope.agreement_ids, who.agreementIds)
  )
    return false;
  const groups = scope.employee_group_ids ?? [];
  if (groups.length && who.groupId !== undefined && !(who.groupId && groups.includes(who.groupId)))
    return false;
  return true;
}
