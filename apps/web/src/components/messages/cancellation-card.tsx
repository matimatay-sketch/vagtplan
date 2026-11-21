"use client";
import { useActionState } from "react";
import { toast } from "sonner";
import { CalendarX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/help/help";
import { FormMessage, SubmitButton } from "@/components/form";
import { closeCancellationAction } from "@/lib/actions/messages";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { shiftWhen } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";

export type CancellationView = {
  id: string;
  status: "open" | "resolved" | "withdrawn";
  department_name: string;
  employee_name: string;
  is_mine: boolean;
  can_resolve: boolean;
  reason: string;
  shift_start: string;
  shift_end: string;
};

function Close({
  id,
  action: kind,
  label,
}: {
  id: string;
  action: "withdraw" | "resolve";
  label: string;
}) {
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await closeCancellationAction(prev, fd);
    if (r.ok) toast.success(r.message ?? da.common.saved);
    return r.ok ? initialActionState : r;
  }, initialActionState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={kind} />
      <SubmitButton
        size="sm"
        variant={kind === "resolve" ? "default" : "outline"}
        data-testid={`cancellation-${kind}`}
      >
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** An afbud in a conversation. */
export function CancellationCard({ item }: { item: CancellationView }) {
  const t = da.cancellation;
  return (
    <div
      className="grid gap-3 rounded-lg border border-destructive/40 bg-card p-3 text-sm"
      data-testid="cancellation-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <CalendarX className="size-4 text-destructive" aria-hidden />
          {t.cardTitle(item.employee_name)}
        </span>
        <Badge variant={item.status === "open" ? "destructive" : "outline"}>
          {t.status[item.status]}
        </Badge>
      </div>
      <p className="tabular">
        {shiftWhen(item.shift_start, item.shift_end)} · {item.department_name}
      </p>
      {item.status === "open" ? (
        <div className="flex flex-wrap items-start gap-2">
          {item.can_resolve ? (
            <>
              <Close id={item.id} action="resolve" label={t.resolve} />
              <HelpTip>{t.resolveHelp}</HelpTip>
            </>
          ) : null}
          {item.is_mine ? <Close id={item.id} action="withdraw" label={t.withdraw} /> : null}
        </div>
      ) : null}
    </div>
  );
}
