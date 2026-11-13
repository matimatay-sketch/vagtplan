import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { parseDanishDecimal } from "@/lib/domain/numbers";
import { RULE_CATALOG, type RuleHandlingMap } from "@/lib/schedule/rule-handling";

const optionalHours = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n < 0 || n > 8760) {
      ctx.addIssue({ code: "custom", message: da.settings.hoursInvalid });
      return z.NEVER;
    }
    return n;
  });

export const noticeSchema = z.object({
  notice_publish_hours: optionalHours,
  notice_change_hours: optionalHours,
});

export function ruleHandlingFromForm(values: Record<string, string>): RuleHandlingMap {
  const out: RuleHandlingMap = {};
  for (const r of RULE_CATALOG) {
    const v = values[`rule:${r.code}`];
    if (v === "block" || v === "allow") out[r.code] = v;
  }
  return out;
}

export const supplementTypeSchema = z
  .object({
    name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
    pay_code: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9_]{1,32}$/, da.settings.payCodeInvalid)),
    amount_type: z.enum(["per_hour", "fixed", "percent"]),
    amount: z.string(),
  })
  .transform((v, ctx) => {
    const n = parseDanishDecimal(v.amount);
    if (n === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: da.validation.invalidNumber });
      return z.NEVER;
    }
    // kr. → øre; percent → basis points (both ×100)
    return { ...v, amount: Math.round(n * 100) };
  });
