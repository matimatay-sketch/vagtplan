"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConditionSelect, RemarkFields } from "@/components/agreements/remark-fields";
import { saveCustomRulesAction } from "@/lib/actions/settings";
import { newCustomRule, type CustomRule } from "@/lib/forms/custom-rules";
import type { ConditionType } from "@/lib/domain/remarks";
import { da } from "@/lib/i18n/da";

const t = da.customRules;
const severities = da.agreements.severities;

/** The organization's own rules: name, what to check, the limit, severity and where shown. */
export function CustomRulesForm({ rules: initial }: { rules: CustomRule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [name, setName] = useState("");
  const [type, setType] = useState<ConditionType>("shift_longer_than");
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<CustomRule>) =>
    setRules((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const add = () => {
    if (!name.trim()) return toast.error(t.nameRequired);
    setRules((rs) => [...rs, newCustomRule(name, type, rs)]);
    setName("");
  };
  const save = () =>
    start(async () => {
      const r = await saveCustomRulesAction(rules);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) router.refresh();
    });

  return (
    <div className="grid gap-4" data-testid="custom-rules">
      {rules.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : null}
      {rules.map((r, i) => (
        <fieldset
          key={r.id}
          className="grid gap-3 rounded-lg border p-3"
          data-custom-rule={r.params.code}
        >
          <legend className="px-1 text-sm font-medium">{r.label || r.params.code}</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label={t.name} htmlFor={`${r.id}-label`}>
              <Input
                id={`${r.id}-label`}
                value={r.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
            </Field>
            <Field label={t.severity} htmlFor={`${r.id}-severity`}>
              <NativeSelect
                id={`${r.id}-severity`}
                value={r.severity}
                onChange={(e) => set(i, { severity: e.target.value as CustomRule["severity"] })}
              >
                {(["BLOCKING", "WARNING", "INFO"] as const).map((k) => (
                  <option key={k} value={k}>
                    {severities[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              aria-label={t.remove(r.label || r.params.code)}
              onClick={() => setRules((rs) => rs.filter((_, k) => k !== i))}
            >
              <Trash2 />
            </Button>
          </div>
          <RemarkFields path={r.id} value={r.params} onChange={(params) => set(i, { params })} />
        </fieldset>
      ))}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
        <Field label={t.newName} htmlFor="custom-rule-name">
          <Input
            id="custom-rule-name"
            value={name}
            placeholder={t.newNamePlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <Field label={t.condition} htmlFor="custom-rule-condition">
          <ConditionSelect id="custom-rule-condition" value={type} onChange={setType} />
        </Field>
        <Button type="button" variant="outline" onClick={add}>
          <Plus /> {t.add}
        </Button>
      </div>
      <div>
        <Button type="button" disabled={pending} onClick={save} data-testid="save-custom-rules">
          {t.save}
        </Button>
      </div>
    </div>
  );
}
