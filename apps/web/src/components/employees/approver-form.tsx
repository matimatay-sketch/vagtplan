"use client";
import { useActionState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { FormMessage, SubmitButton } from "@/components/form";
import { setTimeApproverAction } from "@/lib/actions/employees";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function ApproverForm({
  employeeId,
  approverUserId,
  members,
}: {
  employeeId: string;
  approverUserId: string | null;
  members: { userId: string; label: string }[];
}) {
  const [state, action] = useActionState(setTimeApproverAction, initialActionState);
  const t = da.employees;
  return (
    <form action={action} className="grid gap-1.5" data-testid="approver-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <div className="flex gap-2">
        <div className="min-w-40 flex-1">
          <NativeSelect
            name="approver_user_id"
            defaultValue={approverUserId ?? ""}
            aria-label={t.approver}
          >
            <option value="">{t.approverByDepartment}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <SubmitButton variant="outline" size="sm" className="h-9">
          {da.common.saveApprover}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
