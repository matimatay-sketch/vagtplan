"use client";
import { useActionState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { FormMessage, SubmitButton } from "@/components/form";
import { inviteEmployeeAction } from "@/lib/actions/employees";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function InviteForm({
  employeeId,
  canChooseRole,
}: {
  employeeId: string;
  canChooseRole: boolean;
}) {
  const [state, action] = useActionState(inviteEmployeeAction, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      {canChooseRole ? (
        <NativeSelect name="role" defaultValue="employee" aria-label="Rolle">
          {(["employee", "manager", "admin"] as const).map((r) => (
            <option key={r} value={r}>
              {da.roles[r]}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <input type="hidden" name="role" value="employee" />
      )}
      <SubmitButton variant="outline">{da.employees.invite}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
