"use client";
import { useActionState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { inviteEmployeeAction } from "@/lib/actions/employees";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

/** `profiles` is null when the user may only invite with the default profile. */
export function InviteForm({
  employeeId,
  profiles,
}: {
  employeeId: string;
  profiles: { id: string; name: string }[] | null;
}) {
  const [state, action] = useActionState(inviteEmployeeAction, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      {profiles ? (
        <Field label={da.employees.inviteProfile} htmlFor="profile_id">
          <NativeSelect
            id="profile_id"
            name="profile_id"
            defaultValue={profiles.find((p) => p.name === "Medarbejder")?.id}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <SubmitButton variant="outline">{da.employees.invite}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
