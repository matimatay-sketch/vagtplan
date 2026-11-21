"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpTip } from "@/components/help/help";
import { createDepartmentAction, updateDepartmentMessagingAction } from "@/lib/actions/departments";
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

/** Swap approval and e-mail for messages in one department. */
export function DepartmentMessagingForm({
  id,
  name,
  swapRequiresApproval,
  messageEmail,
}: {
  id: string;
  name: string;
  swapRequiresApproval: boolean;
  messageEmail: boolean;
}) {
  const [state, action] = useActionState(updateDepartmentMessagingAction, initialActionState);
  const t = da.departments;
  return (
    <form action={action} className="grid gap-2" data-testid={`department-messaging-${name}`}>
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`dm-${id}-swap`}
          name="swap_requires_approval"
          defaultChecked={swapRequiresApproval}
        />
        {t.swapApproval}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox id={`dm-${id}-email`} name="message_email" defaultChecked={messageEmail} />
        {t.messageEmail}
        <HelpTip>{t.messageEmailHelp}</HelpTip>
      </label>
      <SubmitButton variant="outline" size="sm" className="w-fit">
        {t.saveMessaging}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
