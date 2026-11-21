import { z } from "zod";
import { da } from "@/lib/i18n/da";

const v = da.validation;
const email = z.string().trim().toLowerCase().pipe(z.email(v.invalidEmail));

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, v.required).max(200, v.tooLong),
  admin_email: email,
  /** Startpakke key; empty = none. */
  starter_kit: z
    .string()
    .trim()
    .nullish()
    .transform((x) => x || null),
});

export const inviteAdminSchema = z.object({
  organization_id: z.guid(),
  admin_email: email,
});
