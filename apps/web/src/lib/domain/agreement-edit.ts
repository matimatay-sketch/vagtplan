/**
 * Editing agreement documents: copies, new versions, local agreements and
 * validation against the documents they inherit from. Pure.
 */
import {
  parseAgreementDocument,
  resolveAgreement,
  type AgreementDocument,
  type AgreementRegistry,
  type ResolutionWarning,
} from "@vagtplan/rules-engine";

export function copyDocument(
  doc: AgreementDocument,
  to: { id: string; name: string; validFrom: string },
): AgreementDocument {
  return {
    ...structuredClone(doc),
    id: to.id,
    name: to.name,
    version: 1,
    valid_from: to.validFrom,
    valid_to: null,
  };
}

export function nextVersion(doc: AgreementDocument, validFrom: string): AgreementDocument {
  return {
    ...structuredClone(doc),
    version: doc.version + 1,
    valid_from: validFrom,
    valid_to: null,
  };
}

export function localDocument(p: {
  id: string;
  name: string;
  parent: string;
  validFrom: string;
}): AgreementDocument {
  return parseAgreementDocument({
    id: p.id,
    name: p.name,
    kind: "local",
    version: 1,
    valid_from: p.validFrom,
    valid_to: null,
    inherits_from: p.parent,
    source: "Lokalaftale",
    rules: [],
  });
}

/** A new, empty agreement that inherits from the law (the base document). */
export function newAgreementDocument(p: {
  id: string;
  name: string;
  parent: string;
  validFrom: string;
}): AgreementDocument {
  return parseAgreementDocument({
    id: p.id,
    name: p.name,
    kind: "agreement",
    version: 1,
    valid_from: p.validFrom,
    valid_to: null,
    inherits_from: p.parent,
    source: p.name,
    rules: [],
  });
}

/** The registry with `doc` added as if published: earlier versions end the day before it starts. */
export function registryWith(
  registry: AgreementRegistry,
  doc: AgreementDocument,
): AgreementRegistry {
  const dayBefore = new Date(`${doc.valid_from}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const end = dayBefore.toISOString().slice(0, 10);
  const others = (registry[doc.id] ?? [])
    .filter((d) => d.version !== doc.version)
    .flatMap((d) =>
      d.valid_from >= doc.valid_from
        ? []
        : [d.valid_to === null || d.valid_to >= doc.valid_from ? { ...d, valid_to: end } : d],
    );
  return { ...registry, [doc.id]: [...others, doc] };
}

export type DocumentCheck = { ok: boolean; errors: string[]; warnings: ResolutionWarning[] };

/**
 * Parses the document and resolves it (with what it inherits) on its start
 * date. Errors block saving and publishing; warnings (e.g. below the law
 * without a legal basis) are shown.
 */
export function validateDocument(registry: AgreementRegistry, input: unknown): DocumentCheck {
  let doc: AgreementDocument;
  try {
    doc = parseAgreementDocument(input);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [] };
  }
  const reg = registryWith(registry, doc);
  try {
    const r = resolveAgreement(reg, { agreementId: doc.id, date: doc.valid_from });
    return { ok: true, errors: [], warnings: r.warnings };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [] };
  }
}
