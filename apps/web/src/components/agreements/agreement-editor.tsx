"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Play, Send, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ParamsForm, type Json } from "./params-form";

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
type Doc = { rules: Rule[]; valid_from: string; [k: string]: unknown };

const kr = (ore: number) =>
  `${ore < 0 ? "−" : ""}${Math.floor(Math.abs(ore) / 100).toLocaleString("da-DK")},${String(Math.abs(ore) % 100).padStart(2, "0")}`;

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
}: {
  versionId: string;
  document: Doc;
  employees: { id: string; name: string }[];
  defaultDate: string;
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
                const r = await publishVersionAction(versionId);
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
                      <option value="BLOCKING">BLOCKING</option>
                      <option value="WARNING">WARNING</option>
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
                <div className="grid gap-1">
                  <div className="text-sm font-medium">{t.params}</div>
                  <ParamsForm
                    value={r.params ?? {}}
                    path={r.id}
                    onChange={(p) => setRule(i, { params: p })}
                  />
                </div>
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
