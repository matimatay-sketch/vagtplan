"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createCustomerAction, inviteCustomerAdminAction } from "@/lib/actions/platform";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function CustomerForm() {
  const t = da.platform;
  const [state, action] = useActionState(createCustomerAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate data-testid="customer-form">
      <FormMessage state={state} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label={t.customerName} htmlFor="name" error={state.errors?.name}>
          <Input autoComplete="organization" {...fieldProps("name", state)} />
        </Field>
        <Field
          label={t.adminEmail}
          htmlFor="admin_email"
          error={state.errors?.admin_email}
          help={t.adminEmailHelp}
        >
          <Input type="email" autoComplete="off" {...fieldProps("admin_email", state)} />
        </Field>
      </div>
      <div>
        <SubmitButton>{t.create}</SubmitButton>
      </div>
    </form>
  );
}

export function InviteAdminForm({ organizationId }: { organizationId: string }) {
  const t = da.platform;
  const [state, action] = useActionState(inviteCustomerAdminAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2" noValidate>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div className="flex gap-2">
        <Input
          type="email"
          name="admin_email"
          placeholder={t.adminEmail}
          aria-label={`${t.inviteAdmin} – ${t.adminEmail}`}
          aria-invalid={state.errors?.admin_email ? true : undefined}
          className="h-8"
        />
        <SubmitButton size="sm" variant="outline">
          {t.inviteAdmin}
        </SubmitButton>
      </div>
      {state.errors?.admin_email ? (
        <p className="text-xs font-medium text-destructive">{state.errors.admin_email}</p>
      ) : null}
      <FormMessage state={state} />
    </form>
  );
}
