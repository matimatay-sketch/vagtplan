import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";

const v = da.validation;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, da.schedule.invalidTime);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const optionalGuid = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || z.guid().safeParse(s).success, v.required);
const optionalLabel = z
  .string()
  .trim()
  .max(60, v.tooLong)
  .optional()
  .transform((s) => (s ? s : null));
const breakMinutes = z
  .string()
  .optional()
  .transform((s, ctx) => {
    const n = s ? Number(s) : 0;
    if (!Number.isInteger(n) || n < 0 || n > 600) {
      ctx.addIssue({ code: "custom", message: v.invalidNumber });
      return z.NEVER;
    }
    return n;
  });

/** Shift length in minutes from local times; an end ≤ start ends the next day. */
export function localDurationMinutes(start: string, end: string): number {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 1440;
}

export const shiftFormSchema = z
  .object({
    id: optionalGuid,
    department_id: z.guid(v.required),
    employee_id: optionalGuid,
    date: z.string().refine(isValidIsoDate, v.invalidDate),
    start_time: hhmm,
    end_time: hhmm,
    break_minutes: breakMinutes,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
    template_id: optionalGuid,
  })
  .superRefine((val, ctx) => {
    if (val.start_time === val.end_time) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
      return;
    }
    if (val.break_minutes >= localDurationMinutes(val.start_time, val.end_time)) {
      ctx.addIssue({ code: "custom", path: ["break_minutes"], message: da.schedule.breakTooLong });
    }
  })
  .transform((val) => ({
    ...val,
    endsNextDay: toMinutes(val.end_time) <= toMinutes(val.start_time),
  }));

export const templateFormSchema = z
  .object({
    name: z.string().trim().min(1, v.required).max(100, v.tooLong),
    department_id: optionalGuid,
    start_time: hhmm,
    end_time: hhmm,
    break_minutes: breakMinutes,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
  })
  .superRefine((val, ctx) => {
    if (val.start_time === val.end_time)
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
    else if (val.break_minutes >= localDurationMinutes(val.start_time, val.end_time)) {
      ctx.addIssue({ code: "custom", path: ["break_minutes"], message: da.schedule.breakTooLong });
    }
  });
