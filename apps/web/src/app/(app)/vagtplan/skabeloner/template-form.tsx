"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import {
  BreaksEditor,
  SupplementPicker,
  type SupplementOption,
} from "@/components/schedule/breaks-editor";
import { createTemplateAction } from "@/lib/actions/schedule";
import { initialActionState } from "@/lib/actions/state";
import type { EditableBreak } from "@/lib/domain/breaks";
import { da } from "@/lib/i18n/da";
import type { PostingDimension } from "@/lib/domain/posting";
import { PostingValuesSelect } from "@/components/posting/posting-values";
import { NormFields } from "@/components/schedule/norm-fields";
import type { NormDefaults } from "@/lib/domain/norm-percent";

export function TemplateForm({
  departments,
  allowOrgWide,
  supplementTypes,
  posting,
  normDefaults,
}: {
  departments: { id: string; name: string }[];
  allowOrgWide: boolean;
  supplementTypes: SupplementOption[];
  posting: PostingDimension[];
  normDefaults: NormDefaults;
}) {
  const [state, action] = useActionState(createTemplateAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [breaks, setBreaks] = useState<EditableBreak[]>([{ start: "", minutes: 30, paid: false }]);
  const [supplements, setSupplements] = useState<string[]>([]);
  const [postingValues, setPostingValues] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"work" | "on_call">("work");
  const [normPercent, setNormPercent] = useState("");
  const [normInPay, setNormInPay] = useState("");
  const t = da.schedule;
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.ok) {
      setPostingValues({});
      setKind("work");
      setNormPercent("");
      setNormInPay("");
    }
  }
  const f = (name: string, fallback?: string) => fieldProps(name, state, fallback);
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field
          label={t.templateName}
          htmlFor="name"
          error={state.errors?.name}
          className="lg:col-span-2"
        >
          <Input placeholder="Fx Dagvagt" {...f("name")} />
        </Field>
        <Field label={t.start} htmlFor="start_time" error={state.errors?.start_time}>
          <Input type="time" step={900} {...f("start_time", "08:00")} />
        </Field>
        <Field label={t.end} htmlFor="end_time" error={state.errors?.end_time}>
          <Input type="time" step={900} {...f("end_time", "16:00")} />
        </Field>
        <Field label={t.kind} htmlFor="kind">
          <NativeSelect
            {...f("kind", "work")}
            onChange={(e) => setKind(e.target.value === "on_call" ? "on_call" : "work")}
          >
            <option value="work">{t.kinds.work}</option>
            <option value="on_call">{t.kinds.on_call}</option>
          </NativeSelect>
        </Field>
        <NormFields
          kind={kind}
          defaults={normDefaults}
          percent={normPercent}
          inPay={normInPay}
          onPercent={setNormPercent}
          onInPay={setNormInPay}
          error={state.errors?.norm_percent}
        />
        <Field label={`${t.label} (${da.common.optional})`} htmlFor="label">
          <Input placeholder={t.labelPlaceholder} {...f("label")} />
        </Field>
        <Field
          label={t.department}
          htmlFor="department_id"
          error={state.errors?.department_id}
          className="lg:col-span-2"
        >
          <NativeSelect {...f("department_id", allowOrgWide ? "" : departments[0]?.id)}>
            {allowOrgWide ? <option value="">{t.allDepartments}</option> : null}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <PostingValuesSelect
          dimensions={posting}
          value={postingValues}
          onChange={setPostingValues}
          name="posting_values"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BreaksEditor value={breaks} onChange={setBreaks} error={state.errors?.breaks} />
        <SupplementPicker options={supplementTypes} value={supplements} onChange={setSupplements} />
      </div>
      <div>
        <SubmitButton>{t.newTemplate}</SubmitButton>
      </div>
    </form>
  );
}
