"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createContractAction, endContractAction } from "@/lib/actions/contracts";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Option = { id: string; name: string; is_example?: boolean };

export function NewContractForm({
  employeeId,
  agreements,
  localAgreements,
  payPeriodGroups,
  defaultValidFrom,
}: {
  employeeId: string;
  agreements: Option[];
  localAgreements: Option[];
  payPeriodGroups: Option[];
  defaultValidFrom: string;
}) {
  const [state, action] = useActionState(createContractAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const t = da.contracts;
  const f = (name: string, fallback?: string | null) => fieldProps(name, state, fallback);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4"
      noValidate
      data-testid="new-contract-form"
    >
      <FormMessage state={state} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t.agreement} htmlFor="agreement_id" error={state.errors?.agreement_id}>
          <NativeSelect
            {...f("agreement_id", agreements.find((a) => !a.is_example)?.id ?? agreements[0]?.id)}
          >
            {agreements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={`${t.localAgreement} (${da.common.optional})`}
          htmlFor="local_agreement_id"
          error={state.errors?.local_agreement_id}
        >
          <NativeSelect {...f("local_agreement_id", "")} disabled={localAgreements.length === 0}>
            <option value="">{da.common.none}</option>
            {localAgreements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={t.payPeriodGroup}
          htmlFor="pay_period_group_id"
          error={state.errors?.pay_period_group_id}
        >
          <NativeSelect {...f("pay_period_group_id", payPeriodGroups[0]?.id)}>
            {payPeriodGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.payForm} htmlFor="pay_form" error={state.errors?.pay_form}>
          <NativeSelect {...f("pay_form", "hourly")}>
            <option value="hourly">{t.payForms.hourly}</option>
            <option value="monthly">{t.payForms.monthly}</option>
          </NativeSelect>
        </Field>
        <Field
          label={t.weeklyHours}
          htmlFor="weekly_hours"
          error={state.errors?.weekly_hours}
          help={t.weeklyHoursHelp}
        >
          <Input inputMode="decimal" {...f("weekly_hours", "37")} />
        </Field>
        <Field
          label={`${t.staffGroup} (${da.common.optional})`}
          htmlFor="staff_group"
          error={state.errors?.staff_group}
        >
          <Input placeholder="Fx Ekspedient" {...f("staff_group")} />
        </Field>
        <Field
          label={`${t.payStep} (${da.common.optional})`}
          htmlFor="pay_step"
          error={state.errors?.pay_step}
        >
          <Input {...f("pay_step")} />
        </Field>
        <Field
          label={`${t.seniorityDate} (${da.common.optional})`}
          htmlFor="seniority_date"
          error={state.errors?.seniority_date}
        >
          <Input type="date" {...f("seniority_date")} />
        </Field>
        <Field label={t.validFrom} htmlFor="valid_from" error={state.errors?.valid_from}>
          <Input type="date" {...f("valid_from", defaultValidFrom)} />
        </Field>
        <Field
          label={`${t.validTo} (${da.common.optional})`}
          htmlFor="valid_to"
          error={state.errors?.valid_to}
        >
          <Input type="date" {...f("valid_to")} />
        </Field>
      </div>
      <fieldset className="group grid gap-3 rounded-lg border bg-muted/40 p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            name="exempt_from_registration"
            className="mt-0.5"
            defaultChecked={state.values?.exempt_from_registration === "on"}
          />
          <span>
            <span className="block text-sm font-medium">{t.exempt}</span>
            <span className="block text-xs text-muted-foreground">{t.exemptHelp}</span>
          </span>
        </label>
        <div className="hidden gap-4 group-has-[input[name=exempt_from_registration]:checked]:grid sm:grid-cols-[2fr_1fr]">
          <Field
            label={t.exemptionReason}
            htmlFor="exemption_reason"
            error={state.errors?.exemption_reason}
          >
            <Textarea rows={2} {...f("exemption_reason")} />
          </Field>
          <Field
            label={t.exemptionSince}
            htmlFor="exemption_since"
            error={state.errors?.exemption_since}
          >
            <Input type="date" {...f("exemption_since")} />
          </Field>
        </div>
      </fieldset>
      <div>
        <SubmitButton>{t.new}</SubmitButton>
      </div>
    </form>
  );
}

export function EndContractForm({
  contractId,
  employeeId,
  defaultDate,
}: {
  contractId: string;
  employeeId: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState(endContractAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" noValidate>
      <input type="hidden" name="id" value={contractId} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <Field
        label={da.contracts.endOn}
        htmlFor={`valid_to-${contractId}`}
        error={state.errors?.valid_to}
      >
        <Input
          type="date"
          id={`valid_to-${contractId}`}
          name="valid_to"
          defaultValue={state.values?.valid_to ?? defaultDate}
          className="w-44"
        />
      </Field>
      <SubmitButton variant="outline">{da.contracts.end}</SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}
