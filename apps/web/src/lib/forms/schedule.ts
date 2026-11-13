import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";

const v = da.validation;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const hhmm = z.string().regex(HHMM, da.schedule.invalidTime);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const optionalGuid = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || z.guid().safeParse(s).success, v.required);
export const optionalLabel = z
  .string()
  .trim()
  .max(60, v.tooLong)
  .optional()
  .transform((s) => (s ? s : null));

/** A break as edited in forms: local start "HH:MM" (or none) and length. */
export type FormBreak = { start: string | null; minutes: number; paid: boolean; nextDay: boolean };

const breakRow = z.object({
  start: z
    .string()
    .nullish()
    .transform((s) => (s ? s : null))
    .refine((s) => s === null || HHMM.test(s), da.schedule.invalidTime),
  minutes: z.number().int().min(1, da.schedule.breakInvalid).max(600, da.schedule.breakInvalid),
  paid: z.boolean().default(false),
});

export const jsonField = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s || "[]") as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: da.common.unknownError });
        return z.NEVER;
      }
    })
    .pipe(schema);

export const breaksField = jsonField(z.array(breakRow).max(10));
export const supplementsField = jsonField(z.array(z.guid()).max(20));

const projectRow = z
  .object({
    project_id: z.guid(da.validation.required),
    mode: z.enum(["rest", "span", "minutes"]),
    from: z.string().nullish(),
    to: z.string().nullish(),
    minutes: z.number().int().nullish(),
  })
  .transform((r, ctx) => {
    const from = r.mode === "span" ? (r.from ?? "") : "";
    const to = r.mode === "span" ? (r.to ?? "") : "";
    if (r.mode === "span" && (!HHMM.test(from) || !HHMM.test(to) || from === to)) {
      ctx.addIssue({ code: "custom", message: da.projects.spanInvalid });
      return z.NEVER;
    }
    if (r.mode === "minutes" && (!r.minutes || r.minutes < 1 || r.minutes > 1440)) {
      ctx.addIssue({ code: "custom", message: da.projects.minutesInvalid });
      return z.NEVER;
    }
    return {
      project_id: r.project_id,
      mode: r.mode,
      from: r.mode === "span" ? from : null,
      to: r.mode === "span" ? to : null,
      minutes: r.mode === "minutes" ? r.minutes! : null,
    };
  });
export const projectsField = jsonField(z.array(projectRow).max(20));

/** A project row as edited in forms; nextDay flags place span times on the next day. */
export type FormProjectRow = z.output<typeof projectRow> & {
  nextDayFrom: boolean;
  nextDayTo: boolean;
};

/** Shift length in minutes from local times; an end ≤ start ends the next day. */
export function localDurationMinutes(start: string, end: string): number {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 1440;
}

/** Checks breaks against the shift and marks breaks that fall after midnight. */
export function checkBreaks(
  val: { start_time: string; end_time: string; breaks: z.output<typeof breaksField> },
  ctx: z.RefinementCtx,
): FormBreak[] {
  const startMin = toMinutes(val.start_time);
  const length = localDurationMinutes(val.start_time, val.end_time);
  const total = val.breaks.reduce((s, b) => s + b.minutes, 0);
  if (total >= length)
    ctx.addIssue({ code: "custom", path: ["breaks"], message: da.schedule.breakTooLong });
  return val.breaks.map((b) => {
    if (b.start === null) return { ...b, nextDay: false };
    let offset = toMinutes(b.start) - startMin;
    if (offset < 0) offset += 1440;
    if (offset + b.minutes > length) {
      ctx.addIssue({ code: "custom", path: ["breaks"], message: da.schedule.breakOutside });
    }
    return { ...b, nextDay: toMinutes(b.start) < startMin };
  });
}

export const shiftFormSchema = z
  .object({
    id: optionalGuid,
    department_id: z.guid(v.required),
    employee_id: optionalGuid,
    date: z.string().refine(isValidIsoDate, v.invalidDate),
    start_time: hhmm,
    end_time: hhmm,
    breaks: breaksField,
    supplement_type_ids: supplementsField,
    project_allocations: projectsField,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
    template_id: optionalGuid,
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
      endsNextDay: toMinutes(val.end_time) <= toMinutes(val.start_time),
    };
  });

export const templateFormSchema = z
  .object({
    name: z.string().trim().min(1, v.required).max(100, v.tooLong),
    department_id: optionalGuid,
    start_time: hhmm,
    end_time: hhmm,
    breaks: breaksField,
    supplement_type_ids: supplementsField,
    project_id: optionalGuid,
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
