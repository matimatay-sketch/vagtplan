import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate, isoWeekday } from "@/lib/domain/civil-date";
import { hoursToMinutes, parseDanishDecimal } from "@/lib/domain/numbers";

const v = da.validation;

const trimmed = (max = 200) => z.string().trim().min(1, v.required).max(max, v.tooLong);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, v.tooLong)
    .optional()
    .transform((s) => (s ? s : null));
const isoDate = z.string().refine(isValidIsoDate, v.invalidDate);
const optionalIsoDate = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || isValidIsoDate(s), v.invalidDate);
/** Browsers omit unchecked checkboxes from FormData, so the key may be absent. */
const checkbox = z
  .enum(["on", "true", ""])
  .nullish()
  .transform((x) => x === "on" || x === "true");
const uuid = z.guid(v.required);
const optionalUuid = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || z.guid().safeParse(s).success, v.required);

export const departmentSchema = z.object({ name: trimmed() });

export const employeeSchema = (today: string) =>
  z
    .object({
      employee_number: trimmed(50),
      first_name: trimmed(100),
      last_name: trimmed(100),
      birth_date: isoDate.refine((d) => d <= today, v.birthDateFuture),
      email: optionalText(254).refine(
        (e) => e === null || z.email().safeParse(e).success,
        v.invalidEmail,
      ),
      phone: optionalText(30),
      school_obligated: checkbox,
      school_obligation_ends_on: optionalIsoDate,
      hired_on: optionalIsoDate,
      stamp_anywhere: checkbox,
      employee_group_id: optionalUuid,
    })
    .superRefine((val, ctx) => {
      if (val.school_obligation_ends_on && !val.school_obligated) {
        ctx.addIssue({ code: "custom", path: ["school_obligated"], message: v.required });
      }
    });

export const contractSchema = z
  .object({
    agreement_id: uuid,
    local_agreement_id: optionalUuid,
    pay_form: z.enum(["hourly", "monthly"]),
    weekly_hours: z.string().transform((s, ctx) => {
      const n = parseDanishDecimal(s);
      if (n === null || n > 80) {
        ctx.addIssue({ code: "custom", message: n === null ? v.invalidNumber : v.hoursRange });
        return z.NEVER;
      }
      return n;
    }),
    pay_period_group_id: uuid,
    staff_group: optionalText(100),
    pay_step: optionalText(50),
    seniority_date: optionalIsoDate,
    valid_from: isoDate,
    valid_to: optionalIsoDate,
    exempt_from_registration: checkbox,
    exemption_reason: optionalText(500),
    exemption_since: optionalIsoDate,
  })
  .superRefine((val, ctx) => {
    if (val.valid_to && val.valid_to < val.valid_from) {
      ctx.addIssue({ code: "custom", path: ["valid_to"], message: v.endBeforeStart });
    }
    if (val.exempt_from_registration) {
      if (!val.exemption_reason)
        ctx.addIssue({ code: "custom", path: ["exemption_reason"], message: v.required });
      if (!val.exemption_since)
        ctx.addIssue({ code: "custom", path: ["exemption_since"], message: v.required });
    }
  })
  .transform(({ weekly_hours, ...rest }) => ({
    ...rest,
    weekly_norm_minutes: hoursToMinutes(weekly_hours),
    exemption_reason: rest.exempt_from_registration ? rest.exemption_reason : null,
    exemption_since: rest.exempt_from_registration ? rest.exemption_since : null,
  }));

export const payPeriodGroupSchema = z
  .object({
    name: trimmed(100),
    frequency: z.enum(["weekly", "biweekly", "monthly"]),
    anchor_date: optionalIsoDate,
    month_start_day: z
      .string()
      .optional()
      .transform((s) => (s ? Number(s) : null)),
  })
  .superRefine((val, ctx) => {
    if (val.frequency === "monthly") {
      const d = val.month_start_day;
      if (d === null || !Number.isInteger(d) || d < 1 || d > 28) {
        ctx.addIssue({ code: "custom", path: ["month_start_day"], message: "1–28" });
      }
    } else if (!val.anchor_date) {
      ctx.addIssue({ code: "custom", path: ["anchor_date"], message: v.required });
    } else if (isoWeekday(val.anchor_date) !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["anchor_date"],
        message: da.payPeriodGroups.mustBeMonday,
      });
    }
  })
  .transform((val) =>
    val.frequency === "monthly" ? { ...val, anchor_date: null } : { ...val, month_start_day: null },
  );

export const signInSchema = z.object({
  email: z.email(v.invalidEmail),
  password: z.string().min(1, v.required),
});

export type FieldErrors = Record<string, string>;

/** Flattens Zod issues to { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
