import "server-only";
import {
  parseAgreementDocument,
  type AgreementRegistry,
  type ContractFacts,
  type EmployeeFacts,
  type EngineInput,
} from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type EngineData = {
  registry: AgreementRegistry;
  /** agreement row id → document id (key) */
  keyById: Map<string, string>;
};

/** Loads all published agreement versions the user can see (templates + own organization). */
export async function loadAgreements(supabase: Client): Promise<EngineData> {
  const { data, error } = await supabase
    .from("agreement_version")
    .select("document, status, agreement:agreement_id (id, key)")
    .eq("status", "published");
  if (error) throw error;
  const registry: AgreementRegistry = {};
  const keyById = new Map<string, string>();
  for (const row of data ?? []) {
    const doc = parseAgreementDocument(row.document);
    (registry[doc.id] ??= []).push(doc);
    if (row.agreement) keyById.set(row.agreement.id, row.agreement.key);
  }
  return { registry, keyById };
}

export type EmployeeEngineRow = {
  id: string;
  birth_date: string;
  school_obligated: boolean;
  school_obligation_ends_on: string | null;
  contract: {
    id: string;
    valid_from: string;
    valid_to: string | null;
    agreement_id: string;
    local_agreement_id: string | null;
    overrides: unknown;
    pay_form: "hourly" | "monthly";
    weekly_norm_minutes: number;
    staff_group: string | null;
    pay_step: string | null;
    seniority_date: string | null;
  }[];
};

export const EMPLOYEE_ENGINE_SELECT =
  "id, birth_date, school_obligated, school_obligation_ends_on, contract (id, valid_from, valid_to, agreement_id, local_agreement_id, overrides, pay_form, weekly_norm_minutes, staff_group, pay_step, seniority_date)";

export function engineInputFor(
  e: EmployeeEngineRow,
  data: EngineData,
  timezone: string,
): EngineInput {
  const employee: EmployeeFacts = {
    birthDate: e.birth_date,
    schoolObligated: e.school_obligated,
    schoolObligationEndsOn: e.school_obligation_ends_on,
  };
  const contracts: ContractFacts[] = e.contract.flatMap((c) => {
    const agreementId = data.keyById.get(c.agreement_id);
    if (!agreementId) return [];
    const overrides = c.overrides as { rules?: unknown[] } | null;
    return [
      {
        id: c.id,
        validFrom: c.valid_from,
        validTo: c.valid_to,
        agreementId,
        localAgreementId: c.local_agreement_id
          ? (data.keyById.get(c.local_agreement_id) ?? null)
          : null,
        overrides: overrides?.rules?.length ? (overrides as ContractFacts["overrides"]) : null,
        payForm: c.pay_form,
        weeklyNormMinutes: c.weekly_norm_minutes,
        staffGroup: c.staff_group,
        payStep: c.pay_step,
        seniorityDate: c.seniority_date,
      },
    ];
  });
  return { timezone, registry: data.registry, employee, contracts };
}

/** Labels of absence types across the loaded agreements (code → label), plus vacation. */
export function absenceLabels(registry: AgreementRegistry): Map<string, string> {
  const out = new Map<string, string>();
  for (const docs of Object.values(registry))
    for (const doc of docs)
      for (const rule of doc.rules)
        if (rule.primitive === "absence")
          for (const t of (rule.params as { types?: { code: string; label: string }[] }).types ??
            [])
            if (!out.has(t.code)) out.set(t.code, t.label);
  return out;
}
