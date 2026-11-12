"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createTemplateAction } from "@/lib/actions/schedule";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function TemplateForm({
  departments,
  allowOrgWide,
}: {
  departments: { id: string; name: string }[];
  allowOrgWide: boolean;
}) {
  const [state, action] = useActionState(createTemplateAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const t = da.schedule;
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
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
        <Field label={t.breakMinutes} htmlFor="break_minutes" error={state.errors?.break_minutes}>
          <Input type="number" min={0} step={5} {...f("break_minutes", "30")} />
        </Field>
        <Field label={t.kind} htmlFor="kind">
          <NativeSelect {...f("kind", "work")}>
            <option value="work">{t.kinds.work}</option>
            <option value="on_call">{t.kinds.on_call}</option>
          </NativeSelect>
        </Field>
        <Field
          label={`${t.label} (${da.common.optional})`}
          htmlFor="label"
          className="lg:col-span-2"
        >
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
        <div className="flex items-end lg:col-span-2">
          <SubmitButton>{t.newTemplate}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
