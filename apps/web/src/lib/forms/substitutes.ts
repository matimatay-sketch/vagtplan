import { z } from "zod";
import { da } from "@/lib/i18n/da";

const t = da.substitutes;

/** A substitute approver for a period (stedfortræder). */
export const substituteSchema = z
  .object({
    absent_user_id: z.guid(t.absentRequired),
    substitute_user_id: z.guid(t.substituteRequired),
    valid_from: z.iso.date(da.validation.invalidDate),
    valid_to: z.iso.date(da.validation.invalidDate),
    note: z
      .string()
      .trim()
      .max(500, da.validation.tooLong)
      .optional()
      .transform((v) => v ?? ""),
  })
  .superRefine((v, ctx) => {
    if (v.absent_user_id === v.substitute_user_id)
      ctx.addIssue({ code: "custom", path: ["substitute_user_id"], message: t.sameUser });
    if (v.valid_to < v.valid_from)
      ctx.addIssue({ code: "custom", path: ["valid_to"], message: t.endBeforeStart });
  });

export type SubstituteStatus = "upcoming" | "active" | "over" | "ended";

/** Where a substitution stands on a date (dates inclusive). */
export function substituteStatus(
  s: { valid_from: string; valid_to: string; archived_at: string | null },
  today: string,
): SubstituteStatus {
  if (s.archived_at) return "ended";
  if (today < s.valid_from) return "upcoming";
  if (today > s.valid_to) return "over";
  return "active";
}
