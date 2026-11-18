import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate, isoWeekday } from "@/lib/domain/civil-date";
import {
  breaksField,
  checkBreaks,
  hhmm,
  optionalGuid,
  optionalLabel,
  supplementsField,
  postingValuesField,
} from "./schedule";

const int = (min: number, max: number) =>
  z.string().transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: da.validation.invalidNumber });
      return z.NEVER;
    }
    return n;
  });

export const rotationSchema = z
  .object({
    name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
    department_id: z.guid(da.validation.required),
    kind: z.enum(["week", "rotation"]),
    length_weeks: z.string().optional(),
  })
  .transform((v, ctx) => {
    if (v.kind === "week") return { name: v.name, department_id: v.department_id, length_weeks: 1 };
    const n = Number(v.length_weeks);
    if (!Number.isInteger(n) || n < 1 || n > 52) {
      ctx.addIssue({ code: "custom", path: ["length_weeks"], message: da.turnus.lengthInvalid });
      return z.NEVER;
    }
    return { name: v.name, department_id: v.department_id, length_weeks: n };
  });

export const slotSchema = z
  .object({
    id: optionalGuid,
    rotation_id: z.guid(),
    line_id: z.guid(),
    week_index: int(0, 51),
    weekday: int(1, 7),
    start_time: hhmm,
    end_time: hhmm,
    breaks: breaksField,
    supplement_type_ids: supplementsField,
    posting_values: postingValuesField,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
  })
  .transform((val, ctx) => {
    if (val.start_time === val.end_time) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
      return z.NEVER;
    }
    return { ...val, breaks: checkBreaks(val, ctx) };
  });

export const rolloutSchema = z.object({
  rotation_id: z.guid(),
  start_date: z
    .string()
    .refine(isValidIsoDate, da.validation.invalidDate)
    .refine((d) => isValidIsoDate(d) && isoWeekday(d) === 1, da.payPeriodGroups.mustBeMonday),
  weeks: int(1, 104),
  assignments: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: da.common.unknownError });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.object({
            lineId: z.guid(),
            employeeId: z.guid().nullable(),
            startWeek: z.number().int().min(0).max(51),
          }),
        )
        .min(1, da.turnus.noAssignments),
    ),
});
