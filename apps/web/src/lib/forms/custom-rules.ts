import { z } from "zod";
import { ruleSchemas } from "@vagtplan/rules-engine";
import { defaultCondition, type ConditionType, type RemarkParams } from "@/lib/domain/remarks";
import { da } from "@/lib/i18n/da";

/**
 * The organization's own rules (Opsætning → Regelhåndtering): remark rules
 * that apply on top of every agreement, with a name and a severity.
 */
export type CustomRule = {
  id: string;
  label: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  params: RemarkParams;
};

const remark = ruleSchemas.remark as unknown as z.ZodType<RemarkParams>;

export const customRulesSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
      label: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
      severity: z.enum(["BLOCKING", "WARNING", "INFO"]),
      params: remark,
    }),
  )
  .max(50)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    for (const [i, r] of rules.entries()) {
      if (seen.has(r.params.code))
        ctx.addIssue({
          code: "custom",
          path: [i, "params", "code"],
          message: da.customRules.codeTwice(r.params.code),
        });
      seen.add(r.params.code);
    }
    if (new Set(rules.map((r) => r.id)).size !== rules.length)
      ctx.addIssue({ code: "custom", message: da.customRules.idTwice });
  });

const ascii = (s: string) =>
  s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");

/** A new own rule from a name: id "egen-…" and code "EGEN_…", both unique. Limits start at 0. */
export function newCustomRule(
  name: string,
  type: ConditionType,
  existing: readonly CustomRule[],
): CustomRule {
  const slug =
    ascii(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/, "") || "regel";
  const base = `egen-${slug}`;
  const taken = (id: string) =>
    existing.some(
      (r) => r.id === id || r.params.code === id.toUpperCase().replace(/-/g, "_").slice(0, 32),
    );
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return {
    id,
    label: name.trim(),
    severity: "WARNING",
    params: {
      code: id.toUpperCase().replace(/-/g, "_").slice(0, 32),
      message: name.trim(),
      show_in: ["schedule", "time"],
      condition: defaultCondition(type),
    },
  };
}
