"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { addAvailabilityAction } from "@/lib/actions/availability";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function AvailabilityForm({ defaultDate }: { defaultDate: string }) {
  const [state, action] = useActionState(addAvailabilityAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const t = da.mySchedule;
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (name: string, fallback?: string) => fieldProps(name, state, fallback);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-3"
      noValidate
      data-testid="availability-form"
    >
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={da.schedule.date} htmlFor="date" error={state.errors?.date}>
          <Input type="date" {...f("date", defaultDate)} />
        </Field>
        <Field label={da.schedule.kind} htmlFor="kind">
          <NativeSelect {...f("kind", "wish_off")}>
            {(["unavailable", "wish_off", "wish_work", "available"] as const).map((k) => (
              <option key={k} value={k}>
                {da.schedule.availability[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={`${t.from} (${da.common.optional})`}
          htmlFor="from_time"
          error={state.errors?.from_time}
        >
          <Input type="time" step={900} {...f("from_time")} />
        </Field>
        <Field
          label={`${t.to} (${da.common.optional})`}
          htmlFor="to_time"
          error={state.errors?.to_time}
        >
          <Input type="time" step={900} {...f("to_time")} />
        </Field>
        <Field
          label={`${t.note} (${da.common.optional})`}
          htmlFor="note"
          error={state.errors?.note}
          className="col-span-2 sm:col-span-3"
        >
          <Input {...f("note")} />
        </Field>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <SubmitButton className="w-full">{t.add}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
