"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { registerAbsenceAction, requestAbsenceAction } from "@/lib/actions/absence";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type LeaveType = { code: string; label: string };

/**
 * Leave request (employee) or registration (manager). With `employees`, the
 * form first picks the employee; the types follow that employee's agreement.
 */
export function AbsenceRequestForm({
  mode,
  types,
  employees,
  defaultDate,
}: {
  mode: "request" | "register";
  /** Types for the employee itself, or per employee id. */
  types: LeaveType[] | Record<string, LeaveType[]>;
  employees?: { id: string; name: string }[];
  defaultDate: string;
}) {
  const t = da.absence;
  const [state, action] = useActionState(
    mode === "register" ? registerAbsenceAction : requestAbsenceAction,
    initialActionState,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [employeeId, setEmployeeId] = useState(employees?.[0]?.id ?? "");
  const options = Array.isArray(types) ? types : (types[employeeId] ?? []);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const v = (k: string) => state.values?.[k];
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4"
      noValidate
      data-testid={mode === "register" ? "absence-register-form" : "absence-request-form"}
    >
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {employees ? (
          <Field label={t.employee} htmlFor={`${mode}-employee`} error={state.errors?.employee_id}>
            <NativeSelect
              id={`${mode}-employee`}
              name="employee_id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Field label={t.type} htmlFor={`${mode}-type`} error={state.errors?.type_code}>
          <NativeSelect
            id={`${mode}-type`}
            name="type_code"
            defaultValue={v("type_code") ?? options[0]?.code}
          >
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.from} htmlFor={`${mode}-from`} error={state.errors?.from_date}>
          <Input
            id={`${mode}-from`}
            name="from_date"
            type="date"
            defaultValue={v("from_date") ?? defaultDate}
          />
        </Field>
        <Field label={t.to} htmlFor={`${mode}-to`} error={state.errors?.to_date}>
          <Input id={`${mode}-to`} name="to_date" type="date" defaultValue={v("to_date") ?? ""} />
        </Field>
        <Field
          label={`${t.note} (${da.common.optional})`}
          htmlFor={`${mode}-note`}
          className={employees ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2 lg:col-span-1"}
        >
          <Input id={`${mode}-note`} name="note" defaultValue={v("note") ?? ""} />
        </Field>
      </div>
      <div>
        <SubmitButton>{mode === "register" ? t.register : t.send}</SubmitButton>
      </div>
    </form>
  );
}
