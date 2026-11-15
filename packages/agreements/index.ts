import {
  parseAgreementDocument,
  type AgreementDocument,
  type AgreementRegistry,
} from "@vagtplan/rules-engine";
import basisDkV1 from "./basis-dk/v1.json" with { type: "json" };
import eksempelDetailV1 from "./eksempel-detail/v1.json" with { type: "json" };

/** All bundled agreement templates, validated. */
export const templates: AgreementDocument[] = [basisDkV1, eksempelDetailV1].map(
  parseAgreementDocument,
);

export function templateRegistry(): AgreementRegistry {
  const registry: AgreementRegistry = {};
  for (const d of templates) (registry[d.id] ??= []).push(d);
  return registry;
}
