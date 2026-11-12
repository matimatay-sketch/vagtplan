import type { IsoDate } from "../time/local-time";
import {
  finalRuleSchema,
  ruleLayerSchema,
  type AgreementDocument,
  type Primitive,
  type Rule,
  type RuleLayer,
} from "./schema";

/** All versions of each agreement, keyed by agreement id. */
export type AgreementRegistry = Record<string, AgreementDocument[]>;

export type LayerRef = { agreementId: string; version: number };

export type ResolvedRule = Rule & {
  /** Layers that defined or changed this rule, root first. */
  layers: LayerRef[];
};

export type ResolutionWarning =
  | {
      code: "BELOW_LAW_MINIMUM";
      ruleId: string;
      path: string;
      base: number;
      value: number;
      layer: LayerRef;
    }
  | { code: "LAW_RULE_REMOVED"; ruleId: string; layer: LayerRef }
  | { code: "EXAMPLE_AGREEMENT"; agreementId: string };

export type ResolvedAgreement = {
  date: IsoDate;
  chain: { id: string; version: number }[];
  rules: ResolvedRule[];
  payCodes: Record<string, { label: string }>;
  warnings: ResolutionWarning[];
};

export type ResolveRequest = {
  agreementId: string;
  localAgreementId?: string | null;
  /** Contract layer (individual contract terms). */
  contractOverrides?: { rules: RuleLayer[] } | null;
  date: IsoDate;
};

/**
 * Parameters where the law sets a minimum. "higher" = higher values are more
 * favourable for the employee. Used to warn when a layer goes below basis-dk.
 */
const LAW_COMPARISONS: Partial<Record<Primitive, [path: string, better: "higher" | "lower"][]>> = {
  rest: [
    ["daily_minutes", "higher"],
    ["weekly_minutes", "higher"],
  ],
  max_weekly_average: [
    ["max_average_minutes", "lower"],
    ["reference_months", "lower"],
  ],
  break: [["after_minutes", "lower"]],
  vacation: [["days_per_month", "higher"]],
};

export function versionOn(
  registry: AgreementRegistry,
  id: string,
  date: IsoDate,
): AgreementDocument {
  const versions = registry[id];
  if (!versions?.length) throw new Error(`Unknown agreement: ${id}`);
  const v = versions.find(
    (d) => d.valid_from <= date && (d.valid_to === null || date <= d.valid_to),
  );
  if (!v) throw new Error(`Agreement ${id} has no version valid on ${date}`);
  return v;
}

function chainFor(registry: AgreementRegistry, id: string, date: IsoDate): AgreementDocument[] {
  const chain: AgreementDocument[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current) {
    if (seen.has(current)) throw new Error(`Inheritance cycle at ${current}`);
    seen.add(current);
    const doc = versionOn(registry, current, date);
    chain.unshift(doc);
    current = doc.inherits_from;
  }
  return chain;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Objects merge recursively; arrays and scalars are replaced. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

type Draft = { raw: Record<string, unknown>; layers: LayerRef[] };

function applyLayer(
  drafts: Map<string, Draft>,
  rules: RuleLayer[],
  layer: LayerRef,
  removals: Map<string, { layer: LayerRef; legalBasis: string | null }>,
) {
  for (const input of rules) {
    const r = ruleLayerSchema.parse(input);
    const existing = drafts.get(r.id);
    if (r.remove) {
      drafts.delete(r.id);
      removals.set(r.id, { layer, legalBasis: r.legal_basis ?? null });
      continue;
    }
    if (existing) {
      if (r.primitive && r.primitive !== existing.raw.primitive) {
        throw new Error(
          `Rule ${r.id}: cannot change primitive from ${String(existing.raw.primitive)} to ${r.primitive}`,
        );
      }
      existing.raw = deepMerge(existing.raw, r) as Record<string, unknown>;
      existing.layers.push(layer);
    } else {
      if (!r.primitive)
        throw new Error(
          `Rule ${r.id} in ${layer.agreementId} overrides nothing and has no primitive`,
        );
      drafts.set(r.id, { raw: { ...r }, layers: [layer] });
    }
  }
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), obj);
}

function finalize(id: string, draft: Draft): ResolvedRule {
  const primitive = draft.raw.primitive as Primitive;
  const result = finalRuleSchema(primitive).safeParse(draft.raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Rule ${id} (${primitive}) is invalid after merging: ${issues}`);
  }
  return { ...(result.data as Rule), layers: draft.layers };
}

/**
 * Resolves the rules that apply to one contract on one date by layering
 * basis-dk → agreement chain → local agreement → contract overrides.
 */
export function resolveAgreement(
  registry: AgreementRegistry,
  req: ResolveRequest,
): ResolvedAgreement {
  const chain = chainFor(registry, req.agreementId, req.date);
  if (req.localAgreementId) chain.push(versionOn(registry, req.localAgreementId, req.date));

  const drafts = new Map<string, Draft>();
  const removals = new Map<string, { layer: LayerRef; legalBasis: string | null }>();
  const payCodes: Record<string, { label: string }> = {};
  for (const doc of chain) {
    applyLayer(drafts, doc.rules, { agreementId: doc.id, version: doc.version }, removals);
    Object.assign(payCodes, doc.pay_codes);
  }
  if (req.contractOverrides?.rules.length) {
    applyLayer(
      drafts,
      req.contractOverrides.rules,
      { agreementId: "contract", version: 1 },
      removals,
    );
  }

  const rules = [...drafts.entries()].map(([id, d]) => finalize(id, d));

  // Compare with the law (the base document at the root of the chain).
  const warnings: ResolutionWarning[] = [];
  const base = chain[0]!;
  if (base.kind === "base") {
    for (const baseLayer of base.rules) {
      const baseRule = finalize(baseLayer.id, { raw: { ...baseLayer }, layers: [] });
      const current = rules.find((r) => r.id === baseRule.id);
      if (!current) {
        const removal = removals.get(baseRule.id);
        if (removal && !removal.legalBasis) {
          warnings.push({ code: "LAW_RULE_REMOVED", ruleId: baseRule.id, layer: removal.layer });
        }
        continue;
      }
      if (current.legal_basis) continue;
      for (const [path, better] of LAW_COMPARISONS[current.primitive] ?? []) {
        const b = getPath(baseRule.params, path);
        const v = getPath(current.params, path);
        if (typeof b !== "number" || typeof v !== "number") continue;
        if ((better === "higher" && v < b) || (better === "lower" && v > b)) {
          warnings.push({
            code: "BELOW_LAW_MINIMUM",
            ruleId: current.id,
            path: `params.${path}`,
            base: b,
            value: v,
            layer: current.layers.at(-1)!,
          });
        }
      }
    }
  }
  for (const doc of chain)
    if (doc.example) warnings.push({ code: "EXAMPLE_AGREEMENT", agreementId: doc.id });

  return {
    date: req.date,
    chain: chain.map((d) => ({ id: d.id, version: d.version })),
    rules,
    payCodes,
    warnings,
  };
}

export function rulesOf<P extends Primitive>(
  resolved: ResolvedAgreement,
  primitive: P,
): (ResolvedRule & Rule<P>)[] {
  return resolved.rules.filter((r) => r.primitive === primitive) as (ResolvedRule & Rule<P>)[];
}
