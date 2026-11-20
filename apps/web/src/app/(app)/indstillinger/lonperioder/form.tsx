"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import {
  archivePayPeriodGroupAction,
  createPayPeriodGroupAction,
  updatePayPeriodGroupAction,
} from "@/lib/actions/pay-periods";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Group = {
  id: string;
  name: string;
  frequency: "weekly" | "biweekly" | "monthly";
  anchor_date: string | null;
  month_start_day: number | null;
};

/** Creates a group, or edits one when `group` is given. */
export function PayPeriodGroupForm({
  defaultMonday,
  group,
}: {
  defaultMonday: string;
  group?: Group;
}) {
  const [state, action] = useActionState(
    group ? updatePayPeriodGroupAction : createPayPeriodGroupAction,
    initialActionState,
  );
  const [frequency, setFrequency] = useState<string>(group?.frequency ?? "biweekly");
  const ref = useRef<HTMLFormElement>(null);
  const t = da.payPeriodGroups;
  // Unique field ids: the page holds the new form and one edit form per group.
  const idp = group ? `g-${group.id}-` : "";
  const fp = (name: string, fallback?: string | null) => ({
    ...fieldProps(name, state, fallback),
    id: `${idp}${name}`,
  });
  useEffect(() => {
    if (state.ok && !group) ref.current?.reset();
  }, [state, group]);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-start"
      noValidate
      data-testid={group ? "edit-pay-period-group" : undefined}
    >
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <Field label={t.name} htmlFor={`${idp}name`} error={state.errors?.name}>
        <Input placeholder="Fx Timelønnede" {...fp("name", group?.name)} />
      </Field>
      <Field label={t.frequency} htmlFor={`${idp}frequency`}>
        <NativeSelect
          id={`${idp}frequency`}
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
          htmlFor={`${idp}month_start_day`}
          error={state.errors?.month_start_day}
          help={t.monthStartHelp}
        >
          <Input
            key="month"
            type="number"
            min={1}
            max={28}
            {...fp("month_start_day", String(group?.month_start_day ?? 1))}
          />
        </Field>
      ) : (
        <Field
          label={t.anchorDate}
          htmlFor={`${idp}anchor_date`}
          error={state.errors?.anchor_date}
          help={t.anchorHelp}
        >
          <Input
            key="anchor"
            type="date"
            {...fp("anchor_date", group?.anchor_date ?? defaultMonday)}
          />
        </Field>
      )}
      <div className="sm:pt-[22px]">
        <SubmitButton>{group ? t.saveGroup : da.common.create}</SubmitButton>
      </div>
      <div className="sm:col-span-4">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Deletes a group (the database refuses while contracts use it). */
export function DeletePayPeriodGroup({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(archivePayPeriodGroupAction, initialActionState);
  const t = da.payPeriodGroups;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t.deleteConfirm(name))) e.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" className="w-fit text-destructive">
        {t.deleteGroup}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
