import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { optionalGuid } from "./schedule";

const v = da.validation;
const date = z.string().refine(isValidIsoDate, v.invalidDate);
const optionalText = z
  .string()
  .trim()
  .max(500, v.tooLong)
  .optional()
  .transform((s) => (s ? s : null));

export const absenceRequestSchema = z
  .object({
    employee_id: optionalGuid,
    type_code: z.string().regex(/^[a-z_]+$/, v.required),
    from_date: date,
    to_date: z.string().optional(),
    note: optionalText,
  })
  .transform((val, ctx) => {
    const to = val.to_date ? val.to_date : val.from_date;
    if (!isValidIsoDate(to)) {
      ctx.addIssue({ code: "custom", path: ["to_date"], message: v.invalidDate });
      return z.NEVER;
    }
    if (to < val.from_date) {
      ctx.addIssue({ code: "custom", path: ["to_date"], message: da.absence.endBeforeStart });
      return z.NEVER;
    }
    return { ...val, to_date: to };
  });

/** "2,5" / "-1" / "0,25" → hundredths (250 / −100 / 25), without floats. */
export function parseDaysToHundredths(input: string): number | null {
  const m = /^\s*([-−]?)(\d{1,4})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const n = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -n : n;
}

export const leavePostingSchema = z
  .object({
    employee_id: z.guid(),
    account: z.string().regex(/^[a-z_]+$/),
    kind: z.enum(["transfer", "payout", "adjustment"]),
    period_start: date,
    usable_until: date,
    days: z.string(),
    note: z.string().trim().min(5, da.absence.reasonRequired).max(500, v.tooLong),
  })
  .transform((val, ctx) => {
    const h = parseDaysToHundredths(val.days);
    if (h === null || h === 0) {
      ctx.addIssue({ code: "custom", path: ["days"], message: da.absence.daysInvalid });
      return z.NEVER;
    }
    // A payout always reduces the balance.
    return { ...val, hundredths: val.kind === "payout" ? -Math.abs(h) : h };
  });
