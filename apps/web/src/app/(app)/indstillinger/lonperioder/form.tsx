"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { createPayPeriodGroupAction } from "@/lib/actions/pay-periods";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function PayPeriodGroupForm({ defaultMonday }: { defaultMonday: string }) {
  const [state, action] = useActionState(createPayPeriodGroupAction, initialActionState);
  const [frequency, setFrequency] = useState("biweekly");
  const ref = useRef<HTMLFormElement>(null);
  const t = da.payPeriodGroups;
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-start"
      noValidate
    >
      <Field label={t.name} htmlFor="name" error={state.errors?.name}>
        <Input placeholder="Fx Timelønnede" {...fieldProps("name", state)} />
      </Field>
      <Field label={t.frequency} htmlFor="frequency">
        <NativeSelect
          id="frequency"
          name="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        >
          {(["weekly", "biweekly", "monthly"] as const).map((f) => (
            <option key={f} value={f}>
              {t.frequencies[f]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {frequency === "monthly" ? (
        <Field
          label={t.monthStartDay}
          htmlFor="month_start_day"
          error={state.errors?.month_start_day}
          help={t.monthStartHelp}
        >
          <Input type="number" min={1} max={28} {...fieldProps("month_start_day", state, "1")} />
        </Field>
      ) : (
        <Field
          label={t.anchorDate}
          htmlFor="anchor_date"
          error={state.errors?.anchor_date}
          help={t.anchorHelp}
        >
          <Input type="date" {...fieldProps("anchor_date", state, defaultMonday)} />
        </Field>
      )}
      <div className="sm:pt-[22px]">
        <SubmitButton>{da.common.create}</SubmitButton>
      </div>
      <div className="sm:col-span-4">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
