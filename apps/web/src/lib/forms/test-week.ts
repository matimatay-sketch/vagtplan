import { z } from "zod";
import { addDays, isValidIsoDate, isoWeekday } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";

const v = da.validation;
const date = z.string().refine(isValidIsoDate, v.invalidDate);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, da.schedule.invalidTime);
const optionalText = z
  .string()
  .trim()
  .max(60)
  .nullish()
  .transform((s) => (s ? s : null));

/** A saved test week (see src/lib/domain/test-weeks.ts). */
export const testCaseSchema = z
  .object({
    name: z.string().trim().min(1, v.required).max(120, v.tooLong),
    weekStart: date.refine((d) => isoWeekday(d) === 1, da.testWeeks.mondayRequired),
    employee: z.object({ birthDate: date, schoolObligated: z.boolean() }),
    contract: z.object({
      payForm: z.enum(["hourly", "monthly"]),
      weeklyNormMinutes: z.number().int().min(0).max(6000),
      staffGroup: optionalText,
      payStep: optionalText,
    }),
    shifts: z
      .array(
        z.object({
          date,
          start: hhmm,
          end: hhmm,
          breakMinutes: z.number().int().min(0).max(600),
          kind: z.enum(["work", "on_call", "call_out"]),
        }),
      )
      .max(50),
    absences: z
      .array(z.object({ type: z.string().regex(/^[a-z_]+$/), from: date, to: date }))
      .max(20),
    expected: z.object({
      lines: z
        .array(
          z.object({
            payCode: z.string().regex(/^[A-Z0-9_]{1,32}$/, da.testWeeks.payCodeInvalid),
            minutes: z.number().int().min(0),
            amountOre: z.number().int(),
          }),
        )
        .max(50),
      violations: z.array(z.string().regex(/^[A-Z_]+$/)).max(30),
    }),
  })
  .superRefine((t, ctx) => {
    const end = addDays(t.weekStart, 6);
    t.shifts.forEach((s, i) => {
      if (s.date < t.weekStart || s.date > end)
        ctx.addIssue({
          code: "custom",
          path: ["shifts", i, "date"],
          message: da.testWeeks.dateOutsideWeek,
        });
    });
    if (t.expected.lines.length === 0 && t.expected.violations.length === 0)
      ctx.addIssue({ code: "custom", path: ["expected"], message: da.testWeeks.expectedRequired });
  });
