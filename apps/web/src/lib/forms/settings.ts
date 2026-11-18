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
    employee_selectable: z.literal("on").nullish(),
  })
  .transform((v, ctx) => {
    const n = parseDanishDecimal(v.amount);
    if (n === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: da.validation.invalidNumber });
      return z.NEVER;
    }
    // kr. → øre; percent → basis points (both ×100)
    return {
      ...v,
      amount: Math.round(n * 100),
      employee_selectable: v.employee_selectable === "on",
    };
  });

const choice = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((s) => (s && (values as readonly string[]).includes(s) ? (s as T) : undefined));
const yesNo = z
  .string()
  .optional()
  .transform((s) => (s === "true" ? true : s === "false" ? false : undefined));
const wholeDays = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n < 0 || n > 366) {
      ctx.addIssue({ code: "custom", message: da.settings.daysInvalid });
      return z.NEVER;
    }
    return n;
  });

/** Leave and on-call rules chosen by the consultant. Missing keys follow the agreement. */
export const leaveRulesSchema = z
  .object({
    entitlement_proration: choice(["none", "remaining_months"]),
    on_call_counts_as_rest: yesNo,
    leave_day_basis: choice(["weekdays", "planned_days"]),
    transfer_allowed: yesNo,
    transfer_only_above_days: wholeDays,
    payout_allowed: yesNo,
    payout_only_above_days: wholeDays,
  })
  .transform((v) => {
    const out: Record<string, string | number | boolean> = {};
    if (v.entitlement_proration) out.entitlement_proration = v.entitlement_proration;
    if (v.on_call_counts_as_rest !== undefined)
      out.on_call_counts_as_rest = v.on_call_counts_as_rest;
    if (v.leave_day_basis) out.leave_day_basis = v.leave_day_basis;
    if (v.transfer_allowed !== undefined) {
      out.transfer_allowed = v.transfer_allowed;
      if (v.transfer_allowed && v.transfer_only_above_days !== null)
        out.transfer_only_above_days = v.transfer_only_above_days;
    }
    if (v.payout_allowed !== undefined) {
      out.payout_allowed = v.payout_allowed;
      if (v.payout_allowed && v.payout_only_above_days !== null)
        out.payout_only_above_days = v.payout_only_above_days;
    }
    return out;
  });

const percent = z
  .string()
  .optional()
  .transform((s, ctx) => {
    const n = Number((s ?? "").trim());
    if (!s || !s.trim() || !Number.isInteger(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: da.schedule.normPercentInvalid });
      return z.NEVER;
    }
    return n;
  });
const bool = z
  .string()
  .optional()
  .transform((s) => s === "true");

/** Norm percent per shift kind (the default when a shift has no value of its own). */
export const normDefaultsSchema = z.object({
  norm_percent_work: percent,
  norm_percent_on_call: percent,
  norm_in_pay_work: bool,
  norm_in_pay_on_call: bool,
});
