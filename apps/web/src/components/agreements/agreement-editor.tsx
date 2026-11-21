"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Play, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form";
import {
  publishVersionAction,
  saveDraftAction,
  simulateAction,
  validateDraftAction,
  type CheckResult,
  type SimResult,
} from "@/lib/actions/agreements";
import { decimalHours } from "@/lib/domain/project-report";
import { da } from "@/lib/i18n/da";
import { formatKroner } from "@/lib/domain/numbers";
import { cn } from "@/lib/utils";
import { ParamsForm, type Json } from "./params-form";
import { ConditionSelect, RemarkFields } from "./remark-fields";
import {
  AccrualFields,
  OnCallFields,
  OvertimeFields,
  AppliesToFields,
  PayCodesTable,
  PayRateFields,
  StampRoundingFields,
  type StampRoundingParams,
  StackingFields,
  SupplementFields,
  appliesToText,
  type AccrualParams,
  type OnCallParams,
  type OvertimeParams,
  type AppliesTo,
  type PayRateParams,
  type Stacking,
  type SupplementParams,
} from "./rule-fields";
import {
  defaultCondition,
  newRemarkRule,
  type ConditionType,
  type RemarkParams,
} from "@/lib/domain/remarks";
import { RULE_TYPES, newRule, payCodesUsed } from "@/lib/domain/rule-templates";
import type { Primitive } from "@vagtplan/rules-engine";

type Rule = {
  id: string;
  primitive?: string;
  label?: string;
  source?: string;
  severity?: string;
  todo_jura?: string | null;
  params?: Json;
  [k: string]: unknown;
};
type Doc = {
  rules: Rule[];
  valid_from: string;
  pay_codes?: Record<string, { label: string }>;
  [k: string]: unknown;
};
/** Rules whose pay lines stack with each other. */
const STACKABLE = ["time_window_supplement", "overtime"];

const kr = formatKroner;

function warningText(w: CheckResult["warnings"][number]): string {
  const t = da.agreements.warnings;
  if (w.code === "BELOW_LAW_MINIMUM") return t.BELOW_LAW_MINIMUM(w.ruleId, w.path, w.value, w.base);
  if (w.code === "LAW_RULE_REMOVED") return t.LAW_RULE_REMOVED(w.ruleId);
  return t.EXAMPLE_AGREEMENT(w.agreementId);
}

export function AgreementEditor({
  versionId,
  document: initial,
  employees,
  defaultDate,
  staffGroups = [],
}: {
  versionId: string;
  document: Doc;
  employees: { id: string; name: string }[];
  defaultDate: string;
  /** Staff groups in the organization's contracts, as suggestions. */
  staffGroups?: string[];
}) {
  const t = da.agreements;
  const router = useRouter();
  const [doc, setDoc] = useState<Doc>(initial);
  const [tab, setTab] = useState<"rules" | "json">("rules");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [pending, start] = useTransition();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Primitive>("time_window_supplement");
  const [remarkType, setRemarkType] = useState<ConditionType>("shift_longer_than");
  const addRule = () => {
    const name = newName.trim();
    if (!name) return toast.error(t.ruleForms.nameRequired);
    const ids = doc.rules.map((r) => r.id);
    const rule =
      newType === "remark"
        ? { ...newRemarkRule(name, ids, defaultCondition(remarkType)), todo_jura: null }
        : newRule(newType, name, ids);
    setDoc((d) => {
      // New pay codes get the rule's name as their label.
      const codes = { ...(d.pay_codes ?? {}) };
      for (const c of payCodesUsed([rule])) codes[c] ??= { label: name };
      return { ...d, pay_codes: codes, rules: [...d.rules, rule as unknown as Rule] };
    });
    setNewName("");
    toast.success(t.ruleForms.added);
    // Open the new rule so it can be filled in at once.
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLDetailsElement>(`details[data-rule="${rule.id}"]`)
        ?.setAttribute("open", ""),
    );
  };
  const allStaffGroups = [
    ...new Set([
      ...staffGroups,
      ...doc.rules.flatMap((r) => (r.applies_to as AppliesTo | undefined)?.staff_groups ?? []),
    ]),
  ].sort((a, b) => a.localeCompare(b, "da"));
  const usedPayCodes = payCodesUsed(doc.rules);
  const knownPayCodes = [...new Set([...Object.keys(doc.pay_codes ?? {}), ...usedPayCodes])].sort();

  const current = (): Doc | null => {
    if (tab === "rules") return doc;
    try {
      return JSON.parse(jsonText) as Doc;
    } catch {
      toast.error(t.jsonInvalid);
      return null;
    }
  };
  const switchTab = (next: "rules" | "json") => {
    if (next === tab) return;
    if (next === "json") setJsonText(JSON.stringify(doc, null, 2));
    else {
      const d = current();
      if (!d) return;
      setDoc(d);
    }
    setTab(next);
  };
  const setRule = (i: number, patch: Partial<Rule>) =>
    setDoc((d) => ({ ...d, rules: d.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));

  return (
    <div className="grid gap-6" data-testid="agreement-editor">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={da.agreements.validFrom} htmlFor="valid_from">
          <Input
            id="valid_from"
            type="date"
            value={doc.valid_from}
            onChange={(e) => setDoc((d) => ({ ...d, valid_from: e.target.value }))}
          />
        </Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              const d = current();
              if (d) start(async () => setCheck(await validateDraftAction(versionId, d)));
            }}
          >
            <CheckCircle2 /> {t.validate}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              const d = current();
              if (!d) return;
              start(async () => {
                const r = await saveDraftAction(versionId, d);
                setCheck(r);
                if (r.message) (r.ok ? toast.success : toast.error)(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            {t.saveDraft}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t.publishConfirm)) return;
              start(async () => {
                let r = await publishVersionAction(versionId);
                if (r.needsConfirm) {
                  if (!window.confirm(r.message ?? "")) return;
                  r = await publishVersionAction(versionId, true);
                }
                if (r.message) (r.ok ? toast.success : toast.error)(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            <Send /> {t.publish}
          </Button>
        </div>
      </div>

      {check ? (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            check.ok
              ? "border-success/40 bg-success/10"
              : "border-destructive/40 bg-destructive/10",
          )}
          data-testid="agreement-check"
        >
          <p className="font-medium">{check.ok ? t.valid : t.invalid}</p>
          <ul className="mt-1 list-disc pl-5">
            {check.errors.map((e, i) => (
              <li key={i} className="text-destructive">
                {e}
              </li>
            ))}
            {check.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-warning-foreground">
                {warningText(w)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-1 border-b" role="tablist">
        {(["rules", "json"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
            onClick={() => switchTab(k)}
          >
            {k === "rules" ? t.rules : t.json}
          </button>
        ))}
      </div>

      {tab === "rules" ? (
        <div className="grid gap-3">
          {doc.rules.map((r, i) => (
            <details key={`${r.id}-${i}`} className="rounded-xl border bg-card" data-rule={r.id}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-medium">{r.label ?? r.id}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {r.id}
                  {r.primitive ? ` · ${r.primitive}` : ""}
                </span>
                <span
                  className="ml-auto rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  data-testid="rule-applies-to"
                >
                  {t.ruleForms.appliesTo}: {appliesToText(r.applies_to as AppliesTo | undefined)}
                </span>
              </summary>
              <div className="grid gap-3 border-t px-4 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.label} htmlFor={`${i}-label`}>
                    <Input
                      id={`${i}-label`}
                      value={r.label ?? ""}
                      onChange={(e) => setRule(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field label={t.source} htmlFor={`${i}-source`}>
                    <Input
                      id={`${i}-source`}
                      value={r.source ?? ""}
                      onChange={(e) => setRule(i, { source: e.target.value })}
                    />
                  </Field>
                  <Field label={t.severity} htmlFor={`${i}-severity`}>
                    <NativeSelect
                      id={`${i}-severity`}
                      value={r.severity ?? ""}
                      onChange={(e) => setRule(i, { severity: e.target.value || undefined })}
                    >
                      <option value="">–</option>
                      {(["BLOCKING", "WARNING", "INFO"] as const).map((k) => (
                        <option key={k} value={k}>
                          {t.severities[k]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t.todoJura} htmlFor={`${i}-todo`}>
                    <Input
                      id={`${i}-todo`}
                      value={r.todo_jura ?? ""}
                      onChange={(e) => setRule(i, { todo_jura: e.target.value || null })}
                    />
                  </Field>
                </div>
                {r.primitive === "remark" ? (
                  <>
                    <p className="text-xs text-muted-foreground">{t.remarks.severityHelp}</p>
                    <RemarkFields
                      path={r.id}
                      value={r.params as unknown as RemarkParams}
                      onChange={(p) => setRule(i, { params: p as unknown as Json })}
                    />
                  </>
                ) : r.primitive === "time_window_supplement" ? (
                  <SupplementFields
                    id={r.id}
                    value={r.params as unknown as SupplementParams}
                    payCodes={knownPayCodes}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : r.primitive === "overtime" ? (
                  <OvertimeFields
                    id={r.id}
                    value={r.params as unknown as OvertimeParams}
                    payCodes={knownPayCodes}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : r.primitive === "on_call" ? (
                  <OnCallFields
                    id={r.id}
                    value={r.params as unknown as OnCallParams}
                    payCodes={knownPayCodes}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : r.primitive === "time_off_accrual" ? (
                  <AccrualFields
                    id={r.id}
                    value={r.params as unknown as AccrualParams}
                    payCodes={knownPayCodes}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : r.primitive === "rounding" ? (
                  <StampRoundingFields
                    id={r.id}
                    value={r.params as unknown as StampRoundingParams}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : r.primitive === "pay_rate" ? (
                  <PayRateFields
                    id={r.id}
                    value={r.params as unknown as PayRateParams}
                    payCodes={knownPayCodes}
                    staffGroups={allStaffGroups}
                    onChange={(p) => setRule(i, { params: p as unknown as Json })}
                  />
                ) : (
                  <div className="grid gap-1">
                    <div className="text-sm font-medium">{t.params}</div>
                    <ParamsForm
                      value={r.params ?? {}}
                      path={r.id}
                      onChange={(p) => setRule(i, { params: p })}
                    />
                  </div>
                )}
                {r.primitive && STACKABLE.includes(r.primitive) ? (
                  <StackingFields
                    id={`${r.id}-stacking`}
                    stacking={r.stacking as Stacking | undefined}
                    priority={r.priority as number | undefined}
                    otherRules={doc.rules
                      .filter(
                        (x) => x.id !== r.id && x.primitive && STACKABLE.includes(x.primitive),
                      )
                      .map((x) => ({ id: x.id, label: x.label ?? x.id }))}
                    onChange={(patch) => setRule(i, patch)}
                  />
                ) : null}
                <AppliesToFields
                  id={`${r.id}-applies`}
                  value={r.applies_to as AppliesTo | undefined}
                  staffGroups={allStaffGroups}
                  onChange={(v) => setRule(i, { applies_to: v })}
                />
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      setDoc((d) => ({ ...d, rules: d.rules.filter((_, k) => k !== i) }))
                    }
                  >
                    <Trash2 /> {t.removeRule}
                  </Button>
                </div>
              </div>
            </details>
          ))}
          <div className="grid gap-3 rounded-xl border border-dashed p-4" data-testid="add-rule">
            <div>
              <div className="font-medium">{t.ruleForms.addTitle}</div>
              <p className="text-sm text-muted-foreground">{t.ruleForms.addLead}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t.ruleForms.ruleName} htmlFor="new-rule-name">
                <Input
                  id="new-rule-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Aftentillæg lager"
                />
              </Field>
              <Field label={t.ruleForms.ruleType} htmlFor="new-rule-type">
                <NativeSelect
                  id="new-rule-type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as Primitive)}
                >
                  {(["pay", "time", "leave", "other"] as const).map((g) => (
                    <optgroup key={g} label={t.ruleForms.typeGroups[g]}>
                      {RULE_TYPES.filter((x) => x.group === g).map((x) => (
                        <option key={x.primitive} value={x.primitive}>
                          {x.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </Field>
              {newType === "remark" ? (
                <Field label={t.remarks.condition} htmlFor="new-rule-condition">
                  <ConditionSelect
                    id="new-rule-condition"
                    value={remarkType}
                    onChange={setRemarkType}
                  />
                </Field>
              ) : null}
            </div>
            <div>
              <Button variant="outline" onClick={addRule}>
                <Plus /> {t.ruleForms.add}
              </Button>
            </div>
          </div>
          <PayCodesTable
            value={doc.pay_codes ?? {}}
            used={usedPayCodes}
            onChange={(pay_codes) => setDoc((d) => ({ ...d, pay_codes }))}
          />
        </div>
      ) : (
        <Textarea
          aria-label={t.json}
          className="min-h-[28rem] font-mono text-xs"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      )}

      <section className="grid gap-3 rounded-xl border bg-card p-4" data-testid="simulator">
        <div>
          <h2 className="font-semibold">{t.simulator}</h2>
          <p className="text-sm text-muted-foreground">{t.simulatorLead}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.employee} htmlFor="sim-employee">
            <NativeSelect
              id="sim-employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t.week} htmlFor="sim-date">
            <Input
              id="sim-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button
            disabled={pending || !employeeId}
            onClick={() => {
              const d = current();
              if (d) start(async () => setSim(await simulateAction(d, employeeId, date)));
            }}
          >
            <Play /> {t.simulate}
          </Button>
        </div>
        {sim && !sim.ok ? <p className="text-sm text-destructive">{sim.message}</p> : null}
        {sim && sim.ok ? (
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">{sim.basis}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {(["before", "after"] as const).map((k) => (
                <div key={k} className="rounded-lg border" data-testid={`sim-${k}`}>
                  <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    {k === "before" ? t.before : t.after}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {sim[k].lines.map((l, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-mono text-xs">{l.payCode}</td>
                          <td className="px-3 py-1.5 text-right tabular">
                            {decimalHours(l.minutes)} t
                          </td>
                          <td className="px-3 py-1.5 text-right tabular">{kr(l.amountOre)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/40 font-semibold">
                        <td className="px-3 py-1.5" colSpan={2}>
                          {da.payroll.total}
                        </td>
                        <td
                          className="px-3 py-1.5 text-right tabular"
                          data-testid={`sim-${k}-total`}
                        >
                          {kr(sim[k].totalOre)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-xs">
                    {sim[k].violations.length ? (
                      <ul className="list-disc pl-4 text-destructive">
                        {sim[k].violations.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">{t.noViolations}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-sm" data-testid="sim-diff">
              <span className="font-medium">{t.difference}: </span>
              {sim.diff.length
                ? sim.diff
                    .map((d) => `${d.payCode} ${d.deltaOre > 0 ? "+" : ""}${kr(d.deltaOre)} kr.`)
                    .join(", ")
                : t.noDifference}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
