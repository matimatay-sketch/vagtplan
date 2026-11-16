"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { saveExpenseCategoryAction, saveMileageRateAction } from "@/lib/actions/expenses";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

const t = da.expenses;

export function MileageRateForm() {
  const [state, action] = useActionState(saveMileageRateAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (n: string, fb?: string) => fieldProps(n, state, fb);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-3 sm:grid-cols-4"
      noValidate
      data-testid="mileage-rate-form"
    >
      <Field label={t.year} htmlFor="year" error={state.errors?.year}>
        <Input type="number" min={2000} max={2100} {...f("year")} />
      </Field>
      <Field label={t.highRate} htmlFor="high_rate" error={state.errors?.high_rate}>
        <Input inputMode="decimal" {...f("high_rate")} />
      </Field>
      <Field label={t.highLimit} htmlFor="high_limit_km" error={state.errors?.high_limit_km}>
        <Input type="number" min={0} {...f("high_limit_km")} />
      </Field>
      <Field label={t.lowRate} htmlFor="low_rate" error={state.errors?.low_rate}>
        <Input inputMode="decimal" {...f("low_rate")} />
      </Field>
      <Field label={t.payCodeHigh} htmlFor="pay_code_high" error={state.errors?.pay_code_high}>
        <Input {...f("pay_code_high")} />
      </Field>
      <Field label={t.payCodeLow} htmlFor="pay_code_low" error={state.errors?.pay_code_low}>
        <Input {...f("pay_code_low")} />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label={t.rateSource}
          htmlFor="source"
          error={state.errors?.source}
          help={t.rateSourceHelp}
        >
          <Input {...f("source")} />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-4">
        <SubmitButton>{t.saveRate}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ExpenseCategoryForm() {
  const [state, action] = useActionState(saveExpenseCategoryAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (n: string) => fieldProps(n, state);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-start"
      noValidate
      data-testid="expense-category-form"
    >
      <Field label={t.categoryName} htmlFor="name" error={state.errors?.name}>
        <Input placeholder="Fx Parkering" {...f("name")} />
      </Field>
      <Field label={da.settings.payCode} htmlFor="pay_code" error={state.errors?.pay_code}>
        <Input {...f("pay_code")} />
      </Field>
      <div className="sm:pt-[22px]">
        <SubmitButton>{t.newCategory}</SubmitButton>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <Checkbox name="receipt_required" defaultChecked />
        {t.receiptRequiredLabel}
      </label>
      <div className="sm:col-span-3">{state.ok ? null : <FormMessage state={state} />}</div>
    </form>
  );
}
