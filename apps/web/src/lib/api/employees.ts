import "server-only";

export const EMPLOYEE_SELECT =
  "id, employee_number, first_name, last_name, email, phone, birth_date, hired_on, terminated_on, archived_at, employee_department!employee_department_organization_id_employee_id_fkey (department_id, is_primary), contract!contract_organization_id_employee_id_fkey (id, agreement_id, pay_form, weekly_norm_minutes, pay_period_group_id, staff_group, valid_from, valid_to)";

export type EmployeeRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string;
  hired_on: string | null;
  terminated_on: string | null;
  archived_at: string | null;
  employee_department: { department_id: string; is_primary: boolean }[];
  contract: {
    id: string;
    agreement_id: string;
    pay_form: string;
    weekly_norm_minutes: number;
    pay_period_group_id: string;
    staff_group: string | null;
    valid_from: string;
    valid_to: string | null;
  }[];
};

export const toApiEmployee = (e: EmployeeRow) => ({
  id: e.id,
  employee_number: e.employee_number,
  first_name: e.first_name,
  last_name: e.last_name,
  email: e.email,
  phone: e.phone,
  birth_date: e.birth_date,
  hired_on: e.hired_on,
  terminated_on: e.terminated_on,
  archived: e.archived_at !== null,
  departments: [...e.employee_department]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((d) => ({ department_id: d.department_id, primary: d.is_primary })),
  contracts: [...e.contract]
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
    .map((c) => ({
      id: c.id,
      agreement_id: c.agreement_id,
      pay_form: c.pay_form,
      weekly_minutes: c.weekly_norm_minutes,
      pay_period_group_id: c.pay_period_group_id,
      staff_group: c.staff_group,
      valid_from: c.valid_from,
      valid_to: c.valid_to,
    })),
});
