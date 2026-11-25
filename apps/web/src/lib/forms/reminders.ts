import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { REMINDER_FREQUENCIES } from "@/lib/domain/reminder-schedule";

export const REMINDER_KINDS = [
  "missing_registration",
  "open_stamp",
  "time_approval",
  "absence_approval",
  "expense_approval",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const t = da.reminders;

/** A reminder rule from the form (FormData: repeated fields are lists). */
export const reminderRuleSchema = z
  .instanceof(FormData)
  .transform((fd) => ({
    name: String(fd.get("name") ?? ""),
    kind: String(fd.get("kind") ?? ""),
    department_ids: fd.getAll("department_ids").map(String),
    employee_ids: fd.getAll("employee_ids").map(String),
    lookback_days: String(fd.get("lookback_days") ?? ""),
    note: String(fd.get("note") ?? ""),
    auto: fd.get("auto") === "on",
    weekdays: fd.getAll("weekdays").map(String),
    frequency: String(fd.get("frequency") ?? "weekly"),
    day_of_month: String(fd.get("day_of_month") ?? "1"),
    month: String(fd.get("month") ?? "1"),
  }))
  .pipe(
    z
      .object({
        name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
        kind: z.enum(REMINDER_KINDS, t.kindRequired),
        department_ids: z.array(z.guid()),
        employee_ids: z.array(z.guid()),
        lookback_days: z
          .string()
          .regex(/^\d{1,3}$/, t.lookbackInvalid)
          .transform(Number)
          .pipe(z.number().int().min(1, t.lookbackInvalid).max(93, t.lookbackInvalid)),
        note: z.string().trim().max(500, da.validation.tooLong),
        auto: z.boolean(),
        weekdays: z.array(
          z
            .string()
            .regex(/^[1-7]$/)
            .transform(Number),
        ),
        frequency: z.enum(REMINDER_FREQUENCIES),
        day_of_month: z
          .string()
          .regex(/^\d{1,2}$/, t.dayInvalid)
          .transform(Number)
          .pipe(z.number().int().min(1, t.dayInvalid).max(31, t.dayInvalid)),
        month: z
          .string()
          .regex(/^\d{1,2}$/)
          .transform(Number)
          .pipe(z.number().int().min(1).max(12)),
      })
      .superRefine((v, ctx) => {
        if (v.auto && v.frequency === "weekly" && v.weekdays.length === 0)
          ctx.addIssue({ code: "custom", path: ["weekdays"], message: t.weekdaysRequired });
        if (v.frequency === "quarterly" && v.month > 3)
          ctx.addIssue({ code: "custom", path: ["month"], message: t.quarterMonthInvalid });
      }),
  );
export type ReminderRuleInput = z.output<typeof reminderRuleSchema>;

/** A reminder message's body ({"kind","count","note"}), or null. */
export function reminderFromBody(
  body: string,
): { kind: ReminderKind; count: number; note: string } | null {
  try {
    const v = JSON.parse(body) as { kind?: unknown; count?: unknown; note?: unknown };
    if (!REMINDER_KINDS.includes(v.kind as ReminderKind)) return null;
    return {
      kind: v.kind as ReminderKind,
      count: typeof v.count === "number" ? v.count : 0,
      note: typeof v.note === "string" ? v.note : "",
    };
  } catch {
    return null;
  }
}
