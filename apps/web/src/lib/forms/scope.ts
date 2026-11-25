import { z } from "zod";

const ids = z.array(z.guid()).max(500);
const list = (formData: FormData, name: string) => ids.parse(formData.getAll(name).map(String));

/** "Gælder for" from a form: the chosen departments and agreements (nothing chosen = all). */
export function scopeFromForm(formData: FormData) {
  return {
    department_ids: list(formData, "department_ids"),
    agreement_ids: list(formData, "agreement_ids"),
  };
}

/** The chosen employee groups (nothing chosen = all). */
export function groupsFromForm(formData: FormData) {
  return { employee_group_ids: list(formData, "employee_group_ids") };
}
