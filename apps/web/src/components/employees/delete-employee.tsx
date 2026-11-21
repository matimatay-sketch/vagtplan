"use client";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/form";
import { archiveEmployeeAction } from "@/lib/actions/employees";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

/** Soft delete with a confirmation; the database explains why if it refuses. */
export function DeleteEmployee({ employeeId, name }: { employeeId: string; name: string }) {
  const [state, action] = useActionState(archiveEmployeeAction, initialActionState);
  const t = da.employees;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t.deleteEmployeeConfirm(name))) e.preventDefault();
      }}
      className="grid gap-2 border-t pt-4"
      data-testid="delete-employee"
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="outline" className="text-destructive">
          <Trash2 /> {t.deleteEmployee}
        </SubmitButton>
        <p className="text-xs text-muted-foreground">{t.deleteEmployeeHelp}</p>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
