import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { MAX_NORM_PERCENT } from "@/lib/domain/norm-percent";

const v = da.validation;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const hhmm = z.string().regex(HHMM, da.schedule.invalidTime);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const optionalGuid = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || z.guid().safeParse(s).success, v.required);
/** Share of the shift counting towards the norm; empty = the default for the kind. */
export const normPercentField = z
  .string()
  .nullish()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n < 0 || n > MAX_NORM_PERCENT) {
      ctx.addIssue({ code: "custom", message: da.schedule.normPercentInvalid });
      return z.NEVER;
    }
    return n;
  });

/** "true"/"false" or empty (the default for the kind). */
export const normInPayField = z
  .string()
  .nullish()
  .transform((s) => (s === "true" ? true : s === "false" ? false : null));

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
/** {dimension id: value id} as JSON (a default posting for the whole shift). */
export const postingValuesField = z
  .string()
  .optional()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s || "{}") as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: da.common.unknownError });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.guid(), z.guid()));

const postingRow = z
  .object({
    values: z.record(z.guid(), z.guid()),
    mode: z.enum(["rest", "span", "minutes"]),
    from: z.string().nullish(),
    to: z.string().nullish(),
    minutes: z.number().int().nullish(),
  })
  .transform((r, ctx) => {
    if (Object.keys(r.values).length === 0) {
      ctx.addIssue({ code: "custom", message: da.posting.valueRequired });
      return z.NEVER;
    }
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
      values: r.values,
      mode: r.mode,
      from: r.mode === "span" ? from : null,
      to: r.mode === "span" ? to : null,
      minutes: r.mode === "minutes" ? r.minutes! : null,
    };
  });
/** Posting rows (konteringsdimensioner): a value per dimension, and a span, minutes or the rest. */
export const postingField = jsonField(z.array(postingRow).max(20));
export type FormPostingRow = z.output<typeof postingRow> & {
  nextDayFrom: boolean;
  nextDayTo: boolean;
};

/** Marks span times before the shift's start time as the next day. */
export function withNextDay<T extends { from: string | null; to: string | null }>(
  rows: readonly T[],
  startTime: string,
): (T & { nextDayFrom: boolean; nextDayTo: boolean })[] {
  const startMin = toMinutes(startTime);
  return rows.map((r) => ({
    ...r,
    nextDayFrom: r.from !== null && toMinutes(r.from) < startMin,
    nextDayTo: r.to !== null && toMinutes(r.to) <= startMin,
  }));
}

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
    required_competence_ids: supplementsField,
    posting_allocations: postingField,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
    norm_percent: normPercentField,
    norm_in_pay: normInPayField,
    template_id: optionalGuid,
  })
  .transform((val, ctx) => {
    if (val.start_time === val.end_time) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
      return z.NEVER;
    }
    const breaks = checkBreaks(val, ctx);
    return {
      ...val,
      breaks,
      posting_allocations: withNextDay(val.posting_allocations, val.start_time),
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
    required_competence_ids: supplementsField,
    posting_values: postingValuesField,
    label: optionalLabel,
    kind: z.enum(["work", "on_call"]).default("work"),
    norm_percent: normPercentField,
    norm_in_pay: normInPayField,
  })
  .transform((val, ctx) => {
    if (val.start_time === val.end_time) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: da.schedule.sameTimes });
      return z.NEVER;
    }
    return { ...val, breaks: checkBreaks(val, ctx) };
  });
