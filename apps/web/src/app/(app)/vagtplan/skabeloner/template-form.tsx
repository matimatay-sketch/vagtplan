"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import {
  BreaksEditor,
  SupplementPicker,
  type SupplementOption,
} from "@/components/schedule/breaks-editor";
import { createTemplateAction, updateTemplateAction } from "@/lib/actions/schedule";
import { initialActionState } from "@/lib/actions/state";
import { templateBreaksToForm, type EditableBreak, type TemplateBreak } from "@/lib/domain/breaks";
import { da } from "@/lib/i18n/da";
import type { PostingDimension } from "@/lib/domain/posting";
import { PostingValuesSelect } from "@/components/posting/posting-values";
import { NormFields } from "@/components/schedule/norm-fields";
import type { NormDefaults } from "@/lib/domain/norm-percent";

export type EditableTemplate = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  breaks: TemplateBreak[];
  supplement_type_ids: string[];
  posting_values: Record<string, string>;
  label: string | null;
  kind: "work" | "on_call";
  norm_percent: number | null;
  norm_in_pay: boolean | null;
  department_id: string | null;
};

/** Creates a template, or edits `template` (shifts already made from it are not changed). */
export function TemplateForm({
  departments,
  allowOrgWide,
  supplementTypes,
  posting,
  normDefaults,
  template,
  onDone,
}: {
  departments: { id: string; name: string }[];
  allowOrgWide: boolean;
  supplementTypes: SupplementOption[];
  posting: PostingDimension[];
  normDefaults: NormDefaults;
  template?: EditableTemplate;
  onDone?: () => void;
}) {
  const tp = template;
  const [state, action] = useActionState(
    tp ? updateTemplateAction : createTemplateAction,
    initialActionState,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [breaks, setBreaks] = useState<EditableBreak[]>(() =>
    tp ? templateBreaksToForm(tp.breaks) : [{ start: "", minutes: 30, paid: false }],
  );
  const [supplements, setSupplements] = useState<string[]>(tp?.supplement_type_ids ?? []);
  const [postingValues, setPostingValues] = useState<Record<string, string>>(
    tp?.posting_values ?? {},
  );
  const [kind, setKind] = useState<"work" | "on_call">(tp?.kind ?? "work");
  const [normPercent, setNormPercent] = useState(String(tp?.norm_percent ?? ""));
  const [normInPay, setNormInPay] = useState(String(tp?.norm_in_pay ?? ""));
  const t = da.schedule;
  const idp = tp ? `t-${tp.id}-` : "";
  useEffect(() => {
    if (state.ok && !tp) ref.current?.reset();
  }, [state, tp]);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.ok && tp) onDone?.();
    if (state.ok && !tp) {
      setPostingValues({});
      setKind("work");
      setNormPercent("");
      setNormInPay("");
    }
  }
  const f = (name: string, fallback?: string | null) => ({
    ...fieldProps(name, state, fallback),
    id: `${idp}${name}`,
  });
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4"
      noValidate
      data-testid={tp ? "edit-template-form" : undefined}
    >
      {tp ? <input type="hidden" name="id" value={tp.id} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field
          label={t.templateName}
          htmlFor={`${idp}name`}
          error={state.errors?.name}
          className="lg:col-span-2"
        >
          <Input placeholder="Fx Dagvagt" {...f("name", tp?.name)} />
        </Field>
        <Field label={t.start} htmlFor={`${idp}start_time`} error={state.errors?.start_time}>
          <Input
            type="time"
            step={900}
            {...f("start_time", tp?.start_time.slice(0, 5) ?? "08:00")}
          />
        </Field>
        <Field label={t.end} htmlFor={`${idp}end_time`} error={state.errors?.end_time}>
          <Input type="time" step={900} {...f("end_time", tp?.end_time.slice(0, 5) ?? "16:00")} />
        </Field>
        <Field label={t.kind} htmlFor={`${idp}kind`}>
          <NativeSelect
            {...f("kind", tp?.kind ?? "work")}
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
          idPrefix={idp}
        />
        <Field label={`${t.label} (${da.common.optional})`} htmlFor={`${idp}label`}>
          <Input placeholder={t.labelPlaceholder} {...f("label", tp?.label)} />
        </Field>
        <Field
          label={t.department}
          htmlFor={`${idp}department_id`}
          error={state.errors?.department_id}
          className="lg:col-span-2"
        >
          <NativeSelect
            {...f(
              "department_id",
              tp ? (tp.department_id ?? "") : allowOrgWide ? "" : departments[0]?.id,
            )}
          >
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
        <SubmitButton>{tp ? t.saveTemplate : t.newTemplate}</SubmitButton>
      </div>
    </form>
  );
}

/** "Ret" on a template row: the form in a dialog (mounted only while open). */
export function EditTemplateButton(
  props: Omit<React.ComponentProps<typeof TemplateForm>, "onDone">,
) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${da.schedule.editTemplate} ${props.template?.name ?? ""}`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{da.schedule.editTemplate}</DialogTitle>
        </DialogHeader>
        <TemplateForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
