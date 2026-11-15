"use client";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createRotationAction } from "@/lib/actions/rotation";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function CreateRotationForm({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createRotationAction, initialActionState);
  const [kind, setKind] = useState("rotation");
  const t = da.turnus;
  return (
    <form
      action={action}
      className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_0.7fr_auto] sm:items-start"
      noValidate
      data-testid="create-rotation"
    >
      <Field label={t.name} htmlFor="name" error={state.errors?.name}>
        <Input placeholder="Fx 3-ugers turnus kasse" {...fieldProps("name", state)} />
      </Field>
      <Field label={da.schedule.department} htmlFor="department_id">
        <NativeSelect {...fieldProps("department_id", state, departments[0]?.id)}>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t.kind} htmlFor="kind">
        <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="week">{t.kinds.week}</option>
          <option value="rotation">{t.kinds.rotation}</option>
        </NativeSelect>
      </Field>
      <Field label={t.weeks} htmlFor="length_weeks" error={state.errors?.length_weeks}>
        <Input
          type="number"
          min={1}
          max={52}
          disabled={kind === "week"}
          {...fieldProps("length_weeks", state, "3")}
        />
      </Field>
      <div className="sm:pt-[22px]">
        <SubmitButton>{t.new}</SubmitButton>
      </div>
      <div className="sm:col-span-5">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
