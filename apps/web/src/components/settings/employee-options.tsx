"use client";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { HelpTip } from "@/components/help/help";
import { setEmployeeOptionAction } from "@/lib/actions/workplaces";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

const t = da.employeeOptions;

/** One organization-wide option for the employees, switched on or off. */
export function EmployeeOptionToggle({
  option,
  enabled,
  children,
}: {
  option: "availability_enabled" | "geofence_enabled";
  enabled: boolean;
  children?: React.ReactNode;
}) {
  const [state, action] = useActionState(setEmployeeOptionAction, initialActionState);
  const label = option === "availability_enabled" ? t.wishes : t.geofence;
  const help = option === "availability_enabled" ? t.wishesHelp : t.geofenceHelp;
  return (
    <div className="grid gap-2" data-testid={`option-${option}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium">
          {label}
          <HelpTip>{help}</HelpTip>
        </span>
        <span
          className={enabled ? "text-success" : "text-muted-foreground"}
          data-testid={`option-${option}-status`}
        >
          {enabled ? t.on : t.off}
        </span>
        <form action={action}>
          <input type="hidden" name="option" value={option} />
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <SubmitButton
            variant="outline"
            size="sm"
            aria-label={`${enabled ? t.turnOff : t.turnOn}: ${label}`}
          >
            {enabled ? t.turnOff : t.turnOn}
          </SubmitButton>
        </form>
        {children}
      </div>
      {state.ok ? null : <FormMessage state={state} />}
    </div>
  );
}
