"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createDepartmentAction } from "@/lib/actions/departments";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function CreateDepartmentForm() {
  const [state, action] = useActionState(createDepartmentAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
    >
      <Field
        label={da.departments.new}
        htmlFor="name"
        error={state.errors?.name}
        className="flex-1"
      >
        <Input placeholder="Fx Lager" {...fieldProps("name", state)} />
      </Field>
      <SubmitButton>{da.common.create}</SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}
