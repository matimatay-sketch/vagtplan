"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { addLeavePostingAction } from "@/lib/actions/absence";
import { initialActionState } from "@/lib/actions/state";
import { formatDays } from "@/lib/domain/leave";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

type Option = {
  account: string;
  label: string;
  periodStart: string;
  usableUntil: string;
  balance: number;
};

/** Transfer, payout or adjustment on one of the employee's balances. */
export function PostingForm({
  employees,
  balances,
}: {
  employees: { id: string; name: string }[];
  balances: Record<string, Option[]>;
}) {
  const t = da.absence;
  const [state, action] = useActionState(addLeavePostingAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const options = balances[employeeId] ?? [];
  const [key, setKey] = useState(0);
  const chosen = options[key] ?? options[0];
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate data-testid="posting-form">
      <FormMessage state={state} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="account" value={chosen?.account ?? ""} />
      <input type="hidden" name="period_start" value={chosen?.periodStart ?? ""} />
      <input type="hidden" name="usable_until" value={chosen?.usableUntil ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.employee} htmlFor="posting-employee">
          <NativeSelect
            id="posting-employee"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setKey(0);
            }}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.account} htmlFor="posting-account">
          <NativeSelect
            id="posting-account"
            value={key}
            onChange={(e) => setKey(Number(e.target.value))}
          >
            {options.map((o, i) => (
              <option key={`${o.account}-${o.periodStart}`} value={i}>
                {o.label} {formatDate(o.periodStart)} ({t.balance} {formatDays(o.balance)})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.posting} htmlFor="posting-kind">
          <NativeSelect id="posting-kind" name="kind" defaultValue="adjustment">
            {(["adjustment", "transfer", "payout"] as const).map((k) => (
              <option key={k} value={k}>
                {t.postingKinds[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.days} htmlFor="posting-days" error={state.errors?.days}>
          <Input id="posting-days" name="days" inputMode="decimal" placeholder="Fx 2,5 eller -1" />
        </Field>
        <Field
          label={t.note}
          htmlFor="posting-note"
          error={state.errors?.note}
          className="sm:col-span-2 lg:col-span-4"
        >
          <Input id="posting-note" name="note" />
        </Field>
      </div>
      <div>
        <SubmitButton variant="outline" disabled={!chosen}>
          {t.addPosting}
        </SubmitButton>
      </div>
    </form>
  );
}
