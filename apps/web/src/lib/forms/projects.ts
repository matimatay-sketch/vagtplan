import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { jsonField, optionalGuid } from "./schedule";

const v = da.validation;

export const projectFormSchema = z.object({
  id: optionalGuid,
  number: z.string().trim().min(1, v.required).max(40, v.tooLong),
  name: z.string().trim().min(1, v.required).max(120, v.tooLong),
  customer: z
    .string()
    .trim()
    .max(120, v.tooLong)
    .optional()
    .transform((s) => (s ? s : null)),
  /** Empty = available in all departments. */
  department_ids: jsonField(z.array(z.guid()).max(200)),
});
