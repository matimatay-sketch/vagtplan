import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import {
  breaksField,
  checkBreaks,
  hhmm,
  optionalGuid,
  postingField,
  projectsField,
  withNextDay,
  type FormProjectRow,
} from "./schedule";

const v = da.validation;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const optionalText = z
  .string()
  .trim()
  .max(500, v.tooLong)
  .optional()
  .transform((s) => (s ? s : null));

/** A registration as edited by the employee or a manager (local date and times). */
export const timeEntryFormSchema = z
  .object({
    id: optionalGuid,
    employee_id: optionalGuid,
    department_id: optionalGuid,
    shift_id: optionalGuid,
    date: z.string().refine(isValidIsoDate, v.invalidDate),
    start_time: hhmm,
    end_time: hhmm,
    breaks: breaksField,
    project_allocations: projectsField,
    posting_allocations: postingField,
    deviation_reason: optionalText,
    note: optionalText,
    kind: z.enum(["work", "call_out"]).default("work"),
  })
  .transform((val, ctx) => {
    if (val.start_time === val.end_time) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
      return z.NEVER;
    }
    const breaks = checkBreaks(val, ctx);
    const startMin = toMinutes(val.start_time);
    const project_allocations: FormProjectRow[] = val.project_allocations.map((r) => ({
      ...r,
      nextDayFrom: r.from !== null && toMinutes(r.from) < startMin,
      nextDayTo: r.to !== null && toMinutes(r.to) <= startMin,
    }));
    return {
      ...val,
      breaks,
      project_allocations,
      posting_allocations: withNextDay(val.posting_allocations, val.start_time),
      endsNextDay: toMinutes(val.end_time) <= startMin,
    };
  });
