"use client";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string;
  school_obligated: boolean;
  school_obligation_ends_on: string | null;
  hired_on: string | null;
};

export function EmployeeForm({
  action,
  employee,
  departments,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  employee?: Employee;
  departments?: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const t = da.employees;
  const [obligated, setObligated] = useState(
    state.values ? state.values.school_obligated === "on" : (employee?.school_obligated ?? false),
  );
  const f = (name: string, fallback?: string | null) => fieldProps(name, state, fallback);

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {employee ? <input type="hidden" name="id" value={employee.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.firstName} htmlFor="first_name" error={state.errors?.first_name}>
          <Input autoComplete="off" {...f("first_name", employee?.first_name)} />
        </Field>
        <Field label={t.lastName} htmlFor="last_name" error={state.errors?.last_name}>
          <Input autoComplete="off" {...f("last_name", employee?.last_name)} />
        </Field>
        <Field label={t.number} htmlFor="employee_number" error={state.errors?.employee_number}>
          <Input {...f("employee_number", employee?.employee_number)} />
        </Field>
        <Field label={t.birthDate} htmlFor="birth_date" error={state.errors?.birth_date}>
          <Input type="date" {...f("birth_date", employee?.birth_date)} />
        </Field>
        <Field
          label={`${t.email} (${da.common.optional})`}
          htmlFor="email"
          error={state.errors?.email}
        >
          <Input type="email" {...f("email", employee?.email)} />
        </Field>
        <Field
          label={`${t.phone} (${da.common.optional})`}
          htmlFor="phone"
          error={state.errors?.phone}
        >
          <Input type="tel" {...f("phone", employee?.phone)} />
        </Field>
        <Field
          label={`${t.hiredOn} (${da.common.optional})`}
          htmlFor="hired_on"
          error={state.errors?.hired_on}
        >
          <Input type="date" {...f("hired_on", employee?.hired_on)} />
        </Field>
        {departments ? (
          <Field label={t.department} htmlFor="department_id" error={state.errors?.department_id}>
            <NativeSelect
              {...f("department_id", departments.length === 1 ? departments[0]!.id : "")}
            >
              <option value="" disabled>
                Vælg …
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
      <fieldset className="grid gap-3 rounded-lg border bg-muted/40 p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            name="school_obligated"
            className="mt-0.5"
            checked={obligated}
            onChange={(e) => setObligated(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">{t.schoolObligated}</span>
            <span className="block text-xs text-muted-foreground">{t.schoolObligatedHelp}</span>
          </span>
        </label>
        {obligated ? (
          <Field
            label={`${t.schoolObligationEndsOn} (${da.common.optional})`}
            htmlFor="school_obligation_ends_on"
            error={state.errors?.school_obligation_ends_on ?? state.errors?.school_obligated}
            className="sm:max-w-xs"
          >
            <Input
              type="date"
              {...f("school_obligation_ends_on", employee?.school_obligation_ends_on)}
            />
          </Field>
        ) : null}
      </fieldset>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
