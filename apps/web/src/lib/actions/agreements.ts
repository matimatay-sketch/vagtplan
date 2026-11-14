"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  parseAgreementDocument,
  shiftsToIntervals,
  simulateWeek,
  type AgreementDocument,
  type ResolutionWarning,
  type WorkIntervalInput,
} from "@vagtplan/rules-engine";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidIsoDate, todayIn, addDays } from "@/lib/domain/civil-date";
import { weekStartOf, zonedTime } from "@/lib/domain/schedule-time";
import type { DbBreak } from "@/lib/domain/breaks";
import {
  copyDocument,
  localDocument,
  nextVersion,
  registryWith,
  validateDocument,
} from "@/lib/domain/agreement-edit";
import { loadAgreements } from "@/lib/engine";
import { engineInputs } from "@/lib/absence/load";
import { da } from "@/lib/i18n/da";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, type ActionState } from "./state";

type Client = Awaited<ReturnType<typeof createClient>>;
const asJson = (v: unknown) => v as NonNullable<Json>;

function revalidateAgreements() {
  revalidatePath("/indstillinger/overenskomster", "layout");
}

async function latestVersion(supabase: Client, agreementId: string) {
  const { data } = await supabase
    .from("agreement_version")
    .select("version, valid_from, document, status")
    .eq("agreement_id", agreementId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** A free key like "eksempel-detail-egen", "-egen-2" … within the organization and the templates. */
async function freeKey(supabase: Client, wanted: string): Promise<string> {
  const { data } = await supabase.from("agreement").select("key").like("key", `${wanted}%`);
  const taken = new Set((data ?? []).map((a) => a.key));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i++) if (!taken.has(`${wanted}-${i}`)) return `${wanted}-${i}`;
}

/** Copies an agreement (typically a system template) into the organization as a draft. */
export async function copyAgreementAction(
  agreementId: string,
): Promise<ActionState & { id?: string }> {
  const ctx = await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const { data: src } = await supabase
    .from("agreement")
    .select("id, key, name, kind, is_example, description")
    .eq("id", z.guid().parse(agreementId))
    .maybeSingle();
  const v = src ? await latestVersion(supabase, src.id) : null;
  if (!src || !v) return { message: da.common.notAllowed };
  const key = await freeKey(supabase, `${src.key}-egen`.slice(0, 60));
  const name = `${src.name} ${da.agreements.copySuffix}`;
  const { data: created, error } = await supabase
    .from("agreement")
    .insert({
      organization_id: ctx.organization.id,
      key,
      name,
      kind: src.kind,
      is_example: src.is_example,
      description: src.description,
    })
    .select("id")
    .single();
  if (error) return { message: dbErrorMessage(error) };
  const doc = copyDocument(parseAgreementDocument(v.document), {
    id: key,
    name,
    validFrom: v.valid_from,
  });
  const { error: vError } = await supabase.from("agreement_version").insert({
    agreement_id: created.id,
    version: 1,
    valid_from: doc.valid_from,
    document: asJson(doc),
  });
  if (vError) return { message: dbErrorMessage(vError) };
  revalidateAgreements();
  return { ok: true, message: da.agreements.copied, id: created.id };
}

/** A local agreement that inherits from `parentId` and starts empty. */
export async function createLocalAction(
  parentId: string,
  name: string,
): Promise<ActionState & { id?: string }> {
  const ctx = await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const title = z.string().trim().min(1).max(100).safeParse(name);
  if (!title.success) return { message: da.validation.required };
  const { data: parent } = await supabase
    .from("agreement")
    .select("key")
    .eq("id", z.guid().parse(parentId))
    .maybeSingle();
  if (!parent) return { message: da.common.notAllowed };
  const key = await freeKey(supabase, `lokal-${parent.key}`.slice(0, 60));
  const { data: created, error } = await supabase
    .from("agreement")
    .insert({ organization_id: ctx.organization.id, key, name: title.data, kind: "local" })
    .select("id")
    .single();
  if (error) return { message: dbErrorMessage(error) };
  const doc = localDocument({
    id: key,
    name: title.data,
    parent: parent.key,
    validFrom: todayIn(ctx.organization.timezone),
  });
  const { error: vError } = await supabase.from("agreement_version").insert({
    agreement_id: created.id,
    version: 1,
    valid_from: doc.valid_from,
    document: asJson(doc),
  });
  if (vError) return { message: dbErrorMessage(vError) };
  revalidateAgreements();
  return { ok: true, message: da.agreements.localCreated, id: created.id };
}

export async function newVersionAction(
  agreementId: string,
  validFrom: string,
): Promise<ActionState> {
  await requireContext(["agreements.manage"]);
  if (!isValidIsoDate(validFrom)) return { message: da.validation.invalidDate };
  const supabase = await createClient();
  const v = await latestVersion(supabase, z.guid().parse(agreementId));
  if (!v) return { message: da.common.notAllowed };
  const doc = nextVersion(parseAgreementDocument(v.document), validFrom);
  const { error } = await supabase.from("agreement_version").insert({
    agreement_id: agreementId,
    version: doc.version,
    valid_from: validFrom,
    document: asJson(doc),
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidateAgreements();
  return { ok: true, message: da.agreements.versionCreated };
}

export type CheckResult = { ok: boolean; errors: string[]; warnings: ResolutionWarning[] };

async function checkDraft(supabase: Client, versionId: string, document: unknown) {
  const { data: row } = await supabase
    .from("agreement_version")
    .select("id, version, status, agreement:agreement_id (key)")
    .eq("id", z.guid().parse(versionId))
    .maybeSingle();
  if (!row || row.status !== "draft" || !row.agreement) return null;
  // The document always carries the agreement's key and the row's version.
  const doc = {
    ...(document as Record<string, unknown>),
    id: row.agreement.key,
    version: row.version,
  };
  const { registry } = await loadAgreements(supabase);
  return { row, doc, check: validateDocument(registry, doc) };
}

export async function validateDraftAction(
  versionId: string,
  document: unknown,
): Promise<CheckResult> {
  await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const r = await checkDraft(supabase, versionId, document);
  return r ? r.check : { ok: false, errors: [da.common.notAllowed], warnings: [] };
}

export async function saveDraftAction(
  versionId: string,
  document: unknown,
): Promise<CheckResult & { message?: string }> {
  await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const r = await checkDraft(supabase, versionId, document);
  if (!r) return { message: da.common.notAllowed, ok: false, errors: [], warnings: [] };
  if (!r.check.ok) return { ...r.check, message: da.agreements.invalid };
  const doc = parseAgreementDocument(r.doc);
  const { error } = await supabase
    .from("agreement_version")
    .update({ document: asJson(doc), valid_from: doc.valid_from, valid_to: doc.valid_to })
    .eq("id", r.row.id);
  if (error) return { message: dbErrorMessage(error), ok: false, errors: [], warnings: [] };
  revalidateAgreements();
  return { ...r.check, ok: true, message: da.agreements.saved };
}

export async function publishVersionAction(versionId: string): Promise<ActionState> {
  await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("agreement_version")
    .select("document")
    .eq("id", z.guid().parse(versionId))
    .maybeSingle();
  if (!row) return { message: da.common.notAllowed };
  const r = await checkDraft(supabase, versionId, row.document);
  if (!r?.check.ok)
    return { message: `${da.agreements.invalid} ${r?.check.errors.join(" ") ?? ""}` };
  const { error } = await supabase.rpc("publish_agreement_version", { p_id: versionId });
  if (error) return { message: dbErrorMessage(error) };
  revalidateAgreements();
  revalidatePath("/", "layout");
  return { ok: true, message: da.agreements.published };
}

export type SimLine = {
  payCode: string;
  label: string;
  minutes: number;
  rateOre: number;
  amountOre: number;
};
export type SimSide = { lines: SimLine[]; totalOre: number; violations: string[] };
export type SimResult =
  | {
      ok: true;
      before: SimSide;
      after: SimSide;
      diff: { payCode: string; deltaOre: number }[];
      basis: string;
    }
  | { ok: false; message: string };

/**
 * Runs a week for an employee with the current setup and with the draft (as
 * if the employee were on it). Uses approved time, or else the schedule.
 */
export async function simulateAction(
  document: unknown,
  employeeId: string,
  date: string,
): Promise<SimResult> {
  const ctx = await requireContext(["agreements.manage"]);
  if (!isValidIsoDate(date)) return { ok: false, message: da.validation.invalidDate };
  let doc: AgreementDocument;
  try {
    doc = parseAgreementDocument(document);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const supabase = await createClient();
  const input = (await engineInputs(supabase, ctx, [z.guid().parse(employeeId)])).get(employeeId);
  if (!input || input.contracts.length === 0) return { ok: false, message: da.common.notAllowed };
  const weekStart = weekStartOf(date);
  const from = new Date(zonedTime(weekStart)).toISOString();
  const to = new Date(zonedTime(addDays(weekStart, 7))).toISOString();

  const { data: entries } = await supabase
    .from("time_entry")
    .select("id, start_at, end_at, breaks, kind")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .is("superseded_at", null)
    .is("archived_at", null)
    .gte("start_at", from)
    .lt("start_at", to);
  let worked: WorkIntervalInput[];
  let basis: string;
  if (entries?.length) {
    worked = shiftsToIntervals(
      entries.map((e) => ({
        id: e.id,
        start: e.start_at,
        end: e.end_at!,
        breaks: ((e.breaks ?? []) as unknown as DbBreak[]).map((b) => ({
          start: b.start_at,
          minutes: b.minutes,
          paid: b.paid,
        })),
      })),
    ).map((i, k) => ({ ...i, kind: entries[k]!.kind }));
    basis = da.agreements.basis(entries.length, da.agreements.sources.actual);
  } else {
    const { data: shifts } = await supabase
      .from("shift")
      .select("id, start_at, end_at, breaks, kind")
      .eq("employee_id", employeeId)
      .is("archived_at", null)
      .gte("start_at", from)
      .lt("start_at", to);
    worked = shiftsToIntervals(
      (shifts ?? []).map((s) => ({
        id: s.id,
        start: s.start_at,
        end: s.end_at,
        breaks: ((s.breaks ?? []) as unknown as DbBreak[]).map((b) => ({
          start: b.start_at,
          minutes: b.minutes,
          paid: b.paid,
        })),
        kind: s.kind,
      })),
    );
    basis = da.agreements.basis(shifts?.length ?? 0, da.agreements.sources.planned);
  }

  const onDoc = input.contracts.some(
    (c) => c.agreementId === doc.id || c.localAgreementId === doc.id,
  );
  try {
    const r = simulateWeek({
      ...input,
      registry: registryWith(input.registry, doc),
      weekStart,
      worked,
      replace: doc,
      assign: onDoc ? undefined : doc.kind === "local" ? "local" : "agreement",
    });
    const side = (s: typeof r.before): SimSide => ({
      lines: s.pay.lines.map((l) => ({
        payCode: l.payCode,
        label: l.label,
        minutes: l.quantityMinutes,
        rateOre: l.rateOre,
        amountOre: l.amountOre,
      })),
      totalOre: s.totalOre,
      violations: s.violations.map((v) => v.message),
    });
    return {
      ok: true,
      before: side(r.before),
      after: side(r.after),
      diff: r.diff.map((d) => ({ payCode: d.payCode, deltaOre: d.deltaOre })),
      basis,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
