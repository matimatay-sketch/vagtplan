import "server-only";
import { parseAgreementDocument, type AgreementRegistry } from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";
import { registryWith } from "@/lib/domain/agreement-edit";
import {
  compareTestCase,
  runTestCase,
  type Comparison,
  type Outcome,
  type TestCase,
} from "@/lib/domain/test-weeks";
import { loadAgreements } from "@/lib/engine";
import { da } from "@/lib/i18n/da";

type Client = Awaited<ReturnType<typeof createClient>>;

export type TestRun = { actual: Outcome; comparison: Comparison } | { error: string };
export type TestWeekResult = {
  id: string;
  name: string;
  test: TestCase;
  published: TestRun | null;
  draft: TestRun | null;
};

export function run(registry: AgreementRegistry, key: string, test: TestCase, tz: string): TestRun {
  try {
    const actual = runTestCase(registry, key, test, tz);
    return { actual, comparison: compareTestCase(actual, test.expected) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs the agreement's saved test weeks against the published version and the saved draft. */
export async function runTestWeeks(
  supabase: Client,
  timezone: string,
  agreementId: string,
): Promise<{ results: TestWeekResult[]; hasDraft: boolean }> {
  const [{ data: agreement }, { data: cases }, { registry }] = await Promise.all([
    supabase
      .from("agreement")
      .select("key, agreement_version (status, document)")
      .eq("id", agreementId)
      .maybeSingle(),
    supabase
      .from("agreement_test_case")
      .select("id, name, test")
      .eq("agreement_id", agreementId)
      .is("archived_at", null)
      .order("name"),
    loadAgreements(supabase),
  ]);
  if (!agreement) return { results: [], hasDraft: false };
  const draftRow = agreement.agreement_version.find((v) => v.status === "draft");
  let draftRegistry: AgreementRegistry | null = null;
  if (draftRow) {
    try {
      draftRegistry = registryWith(registry, parseAgreementDocument(draftRow.document));
    } catch {
      draftRegistry = null;
    }
  }
  const hasPublished = (registry[agreement.key] ?? []).length > 0;
  const results = (cases ?? []).map((c) => {
    const test = c.test as unknown as TestCase;
    return {
      id: c.id,
      name: c.name,
      test,
      published: hasPublished ? run(registry, agreement.key, test, timezone) : null,
      draft: draftRow
        ? draftRegistry
          ? run(draftRegistry, agreement.key, test, timezone)
          : { error: da.agreements.invalid }
        : null,
    };
  });
  return { results, hasDraft: Boolean(draftRow) };
}
