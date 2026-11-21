import {
  parseAgreementDocument,
  type AgreementDocument,
  type AgreementRegistry,
} from "@vagtplan/rules-engine";
import basisDkV1 from "./basis-dk/v1.json" with { type: "json" };
import eksempelDetailV1 from "./eksempel-detail/v1.json" with { type: "json" };
import industriV1 from "./industriens-overenskomst/v1.json" with { type: "json" };
import industriV2 from "./industriens-overenskomst/v2.json" with { type: "json" };
import industriV3 from "./industriens-overenskomst/v3.json" with { type: "json" };
import industriStarter from "./industriens-overenskomst/startpakke.json" with { type: "json" };

/** All bundled agreement templates, validated. */
export const templates: AgreementDocument[] = [
  basisDkV1,
  eksempelDetailV1,
  industriV1,
  industriV2,
  industriV3,
].map(parseAgreementDocument);

/**
 * Startpakke: what a new customer base on an agreement gets besides the
 * agreement (chosen by the platform administrator when creating the customer).
 */
export type StarterKit = {
  key: string;
  name: string;
  agreement: string;
  description: string;
  pay_period_groups: { name: string; frequency: "weekly" | "biweekly"; anchor_date: string }[];
  supplement_types: {
    name: string;
    pay_code: string;
    amount_type: "per_hour" | "fixed" | "percent";
    amounts: { valid_from: string; amount: number }[];
  }[];
};

export const starterKits: StarterKit[] = [industriStarter as StarterKit];

export function templateRegistry(): AgreementRegistry {
  const registry: AgreementRegistry = {};
  for (const d of templates) (registry[d.id] ??= []).push(d);
  return registry;
}
