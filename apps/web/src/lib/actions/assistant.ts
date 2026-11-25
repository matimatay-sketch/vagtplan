"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { requireContext, type AppContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment } from "@/lib/permissions";
import { Pseudonyms } from "@/lib/domain/pseudonyms";
import {
  payContext,
  ruleKey,
  scheduleContext,
  type PayLineRow,
} from "@/lib/domain/assistant-context";
import { checkProposal, type CheckedShift } from "@/lib/domain/proposal";
import { ageOn } from "@/lib/domain/age";
import { addDays, isValidIsoDate } from "@/lib/domain/civil-date";
import { weekDates, weekStartOf, zonedTime } from "@/lib/domain/schedule-time";
import { localInstants } from "@/lib/schedule/breaks";
import { loadAgreements } from "@/lib/engine";
import { loadPostingDimensions } from "@/lib/posting/load";
import { archiveShifts, blockingFor } from "@/lib/schedule/proposals";
import {
  ASSISTANT_MODEL,
  askProposal,
  askText,
  assistantConfigured,
  isApiError,
  type Outcome,
  type Usage,
} from "@/lib/assistant/claude";
import { PAY_SYSTEM, SCHEDULE_SYSTEM } from "@/lib/assistant/prompts";
import type { Json } from "@/lib/supabase/database.types";
import { da } from "@/lib/i18n/da";
import { departmentUsesWishes } from "@/lib/schedule/wishes";

type Client = Awaited<ReturnType<typeof createClient>>;
const t = da.assistant;

export type AssistantResult = { ok: true; answer: string } | { ok: false; message: string };

async function available(supabase: Client, ctx: AppContext): Promise<string | null> {
  if (!assistantConfigured()) return t.notConfigured;
  const { data } = await supabase
    .from("organization_settings")
    .select("assistant_enabled")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  return data?.assistant_enabled ? null : t.disabled;
}

async function log(
  supabase: Client,
  ctx: AppContext,
  kind: "pay_explanation" | "schedule_proposal",
  outcome: Outcome,
  usage: Usage,
  departmentId: string | null = null,
) {
  await supabase.from("assistant_request").insert({
    organization_id: ctx.organization.id,
    kind,
    department_id: departmentId,
    model: ASSISTANT_MODEL,
    outcome,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  });
}

const failure = (e: unknown): string => (isApiError(e) ? t.apiError : t.unknownError);

/** May the user use the assistant for something in one of these departments? */
const assistantIn = (ctx: AppContext, departmentIds: string[]) =>
  departmentIds.some((d) =>
    canInDepartment(ctx.permissions, "assistant.use", d, ctx.responsibleDepartmentIds),
  );

// --------------------------------------------------------------- pay lines

/** Explains an employee's pay lines in a period, from the stored explanations. */
export async function explainPayAction(input: {
  periodId: string;
  employeeId: string;
  question: string;
}): Promise<AssistantResult> {
  const ctx = await requireContext(["assistant.use"]);
  const p = z
    .object({ periodId: z.guid(), employeeId: z.guid(), question: z.string().trim().max(1000) })
    .parse(input);
  const supabase = await createClient();
  const off = await available(supabase, ctx);
  if (off) return { ok: false, message: off };

  const [{ data: period }, { data: run }, { data: employee }, { data: depts }] = await Promise.all([
    supabase.from("pay_period").select("start_date, end_date").eq("id", p.periodId).maybeSingle(),
    supabase
      .from("pay_run")
      .select(
        "notes, pay_line (position, pay_code, label, unit, quantity_minutes, rate_ore, amount_ore, explanation, posting)",
      )
      .eq("pay_period_id", p.periodId)
      .eq("employee_id", p.employeeId)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("employee")
      .select("first_name, last_name, employee_number")
      .eq("id", p.employeeId)
      .maybeSingle(),
    supabase.from("employee_department").select("department_id").eq("employee_id", p.employeeId),
  ]);
  // The pay run is only visible with payroll.view for the employee (RLS).
  if (!period || !run) return { ok: false, message: t.noPayRun };
  if (
    !assistantIn(
      ctx,
      (depts ?? []).map((d) => d.department_id),
    )
  )
    return { ok: false, message: da.common.notAllowed };

  const [agreements, posting] = await Promise.all([
    loadAgreements(supabase),
    loadPostingDimensions(supabase),
  ]);
  const lines = [...run.pay_line].sort(
    (a, b) => a.position - b.position,
  ) as unknown as PayLineRow[];
  const ruleParams: Record<string, unknown> = {};
  for (const l of lines) {
    const { agreementId, version } = l.explanation.layer;
    const doc = agreements.registry[agreementId]?.find((d) => d.version === version);
    const rule = doc?.rules.find((r) => r.id === l.explanation.ruleId);
    if (rule) ruleParams[ruleKey(agreementId, version, rule.id)] = rule.params ?? null;
  }
  const postingNames: Record<string, string> = {};
  for (const d of posting) {
    postingNames[d.id] = d.name;
    for (const v of d.values) postingNames[v.id] = v.code;
  }

  const pseudo = new Pseudonyms();
  const name = employee ? `${employee.first_name} ${employee.last_name}` : "";
  const context = payContext(
    {
      employee: { id: p.employeeId, name, number: employee?.employee_number ?? "" },
      period: { start: period.start_date, end: period.end_date },
      lines,
      notes: (run.notes ?? []) as unknown as { code: string; message: string }[],
      ruleParams,
      postingNames,
    },
    pseudo,
  );
  const question = pseudo.scrub(p.question || t.defaultPayQuestion);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Lønkørsel (JSON):\n${JSON.stringify(context, null, 1)}\n\nSpørgsmål: ${question}`,
    },
  ];
  try {
    const r = await askText(PAY_SYSTEM, messages);
    await log(supabase, ctx, "pay_explanation", r.outcome, r.usage);
    if (r.outcome === "refused" || !r.text) return { ok: false, message: t.refused };
    return { ok: true, answer: pseudo.restore(r.text) };
  } catch (e) {
    await log(supabase, ctx, "pay_explanation", "error", { inputTokens: 0, outputTokens: 0 });
    return { ok: false, message: failure(e) };
  }
}

// --------------------------------------------------------------- schedule

export type ProposalResult =
  | { ok: true; created: number; skipped: number; blocking: number; notes: string }
  | { ok: false; message: string };

/** Proposes draft shifts for a department and week. The leader reviews and publishes. */
export async function proposeScheduleAction(input: {
  departmentId: string;
  weekStart: string;
  instructions: string;
}): Promise<ProposalResult> {
  const ctx = await requireContext(["assistant.use"]);
  const p = z
    .object({
      departmentId: z.guid(),
      weekStart: z.string().refine(isValidIsoDate),
      instructions: z.string().trim().min(3, t.instructionsRequired).max(2000),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: t.instructionsRequired };
  const { departmentId, instructions } = p.data;
  const weekStart = weekStartOf(p.data.weekStart);
  if (
    !canInDepartment(
      ctx.permissions,
      "schedule.manage",
      departmentId,
      ctx.responsibleDepartmentIds,
    ) ||
    !assistantIn(ctx, [departmentId])
  )
    return { ok: false, message: da.common.notAllowed };
  const supabase = await createClient();
  const off = await available(supabase, ctx);
  if (off) return { ok: false, message: off };

  const dates = weekDates(weekStart);
  const from = new Date(zonedTime(weekStart)).toISOString();
  const to = new Date(zonedTime(addDays(weekStart, 7))).toISOString();
  const [{ data: dept }, { data: members }, { data: existing }, { data: templates }] =
    await Promise.all([
      supabase.from("department").select("id, name").eq("id", departmentId).maybeSingle(),
      supabase
        .from("employee_department")
        .select(
          "employee:employee!employee_department_organization_id_employee_id_fkey (id, first_name, last_name, birth_date, archived_at, contract (valid_from, valid_to, weekly_norm_minutes))",
        )
        .eq("department_id", departmentId),
      supabase
        .from("shift")
        .select("id, employee_id, start_at, end_at, status")
        .eq("department_id", departmentId)
        .is("archived_at", null)
        .gte("start_at", from)
        .lt("start_at", to),
      supabase
        .from("shift_template")
        .select("name, start_time, end_time, breaks, department_id")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .or(`department_id.is.null,department_id.eq.${departmentId}`),
    ]);
  if (!dept) return { ok: false, message: da.common.notAllowed };
  const employees = (members ?? []).flatMap((m) =>
    m.employee && !m.employee.archived_at ? [m.employee] : [],
  );
  const ids = employees.map((e) => e.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const usesWishes = await departmentUsesWishes(supabase, ctx.organization.id, departmentId);
  const [{ data: availability }, { data: absences }] = await Promise.all([
    usesWishes
      ? supabase
          .from("availability")
          .select("employee_id, date, kind, from_time, to_time")
          .in("employee_id", ids.length ? ids : none)
          .is("archived_at", null)
          .gte("date", weekStart)
          .lte("date", dates[6]!)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("absence")
      .select("employee_id, type_code, from_date, to_date")
      .in("employee_id", ids.length ? ids : none)
      .in("status", ["approved", "requested"])
      .lte("from_date", dates[6]!)
      .gte("to_date", weekStart),
  ]);

  const pseudo = new Pseudonyms();
  const context = scheduleContext(
    {
      department: { id: dept.id, name: dept.name },
      weekDates: dates,
      employees: employees.map((e) => {
        const contract = e.contract.find(
          (c) => c.valid_from <= dates[6]! && (c.valid_to === null || c.valid_to >= weekStart),
        );
        return {
          id: e.id,
          name: `${e.first_name} ${e.last_name}`,
          weeklyNormMinutes: contract?.weekly_norm_minutes ?? null,
          under18: ageOn(e.birth_date, weekStart) < 18,
          availability: (availability ?? [])
            .filter((a) => a.employee_id === e.id)
            .map((a) => ({
              date: a.date,
              kind: a.kind,
              from: a.from_time?.slice(0, 5) ?? null,
              to: a.to_time?.slice(0, 5) ?? null,
            })),
          absences: (absences ?? [])
            .filter((a) => a.employee_id === e.id)
            .map((a) => ({ from: a.from_date, to: a.to_date, type: a.type_code })),
        };
      }),
      existing: (existing ?? []).map((s) => ({
        employeeId: s.employee_id,
        start: s.start_at,
        end: s.end_at,
        status: s.status,
      })),
      templates: (templates ?? []).map((tpl) => ({
        name: tpl.name,
        start: tpl.start_time.slice(0, 5),
        end: tpl.end_time.slice(0, 5),
        breakMinutes: ((tpl.breaks ?? []) as { minutes: number; paid: boolean }[])
          .filter((b) => !b.paid)
          .reduce((s, b) => s + b.minutes, 0),
      })),
    },
    pseudo,
  );
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Uge og afdeling (JSON):\n${JSON.stringify(context, null, 1)}\n\nLederens ønsker: ${pseudo.scrub(instructions)}`,
    },
  ];
  const checkCtx = {
    pseudonyms: pseudo,
    weekDates: dates,
    employeeIds: ids,
    existing: (existing ?? []).map((s) => ({
      employeeId: s.employee_id,
      start: s.start_at,
      end: s.end_at,
    })),
  };

  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: Usage) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
  };
  try {
    const first = await askProposal(SCHEDULE_SYSTEM, messages);
    add(first.usage);
    if (!first.proposal) {
      await log(supabase, ctx, "schedule_proposal", first.outcome, usage, departmentId);
      return { ok: false, message: first.outcome === "refused" ? t.refused : t.unknownError };
    }
    let checked = checkProposal(first.proposal.shifts, checkCtx);
    let notes = first.proposal.notes;
    const { data: proposal, error } = await supabase
      .from("assistant_proposal")
      .insert({
        organization_id: ctx.organization.id,
        department_id: departmentId,
        week_start: weekStart,
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: da.common.notAllowed };
    let shiftIds = await insertShifts(supabase, ctx, departmentId, proposal.id, checked.shifts);
    let blocking = await blockingFor(supabase, ctx, ids, weekStart, shiftIds);

    // One round of corrections when shifts were dropped or break hard rules.
    if (checked.problems.length || blocking.length) {
      messages.push({ role: "assistant", content: first.raw });
      messages.push({
        role: "user",
        content: `Forslaget blev kontrolleret:\n${[
          ...checked.problems.map((x) => `- Vagt nr. ${x.index + 1}: ${t.problemText[x.code]}`),
          ...blocking.map(
            (v) => `- ${pseudo.code("employee", v.employeeId, "")} ${v.date}: ${v.message}`,
          ),
        ].join("\n")}\nSend hele forslaget igen, rettet.`,
      });
      const second = await askProposal(SCHEDULE_SYSTEM, messages);
      add(second.usage);
      if (second.proposal) {
        await archiveShifts(supabase, shiftIds);
        checked = checkProposal(second.proposal.shifts, checkCtx);
        notes = second.proposal.notes;
        shiftIds = await insertShifts(supabase, ctx, departmentId, proposal.id, checked.shifts);
        blocking = await blockingFor(supabase, ctx, ids, weekStart, shiftIds);
      }
    }
    await supabase
      .from("assistant_proposal")
      .update({ note: pseudo.restore(notes).slice(0, 2000) })
      .eq("id", proposal.id);
    await log(supabase, ctx, "schedule_proposal", "ok", usage, departmentId);
    revalidatePath("/vagtplan", "layout");
    return {
      ok: true,
      created: shiftIds.length,
      skipped: checked.problems.length,
      blocking: blocking.length,
      notes: pseudo.restore(notes),
    };
  } catch (e) {
    await log(supabase, ctx, "schedule_proposal", "error", usage, departmentId);
    return { ok: false, message: failure(e) };
  }
}

async function insertShifts(
  supabase: Client,
  ctx: AppContext,
  departmentId: string,
  proposalId: string,
  shifts: CheckedShift[],
): Promise<string[]> {
  if (shifts.length === 0) return [];
  const { data, error } = await supabase
    .from("shift")
    .insert(
      shifts.map((s) => ({
        organization_id: ctx.organization.id,
        department_id: departmentId,
        employee_id: s.employeeId,
        ...localInstants(s.date, s.start, s.end, s.endsNextDay),
        breaks: (s.breakMinutes
          ? [{ start_at: null, minutes: s.breakMinutes, paid: false }]
          : []) as unknown as NonNullable<Json>,
        label: s.label,
        kind: "work" as const,
        proposal_id: proposalId,
      })),
    )
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

/** Discards a proposal: its shifts that were never published are archived. */
export async function discardProposalAction(proposalId: string): Promise<{ ok: boolean }> {
  await requireContext(["schedule.manage"]);
  const id = z.guid().parse(proposalId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_proposal")
    .update({ discarded_at: new Date().toISOString() })
    .eq("id", id)
    .is("discarded_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false };
  await supabase
    .from("shift")
    .update({ archived_at: new Date().toISOString() })
    .eq("proposal_id", id)
    .is("published", null)
    .is("archived_at", null);
  revalidatePath("/vagtplan", "layout");
  return { ok: true };
}
