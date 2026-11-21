"use client";
import { useActionState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/form";
import { swapDecisionAction } from "@/lib/actions/messages";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { shiftWhen } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";

export type SwapView = {
  id: string;
  status: "proposed" | "accepted" | "completed" | "declined" | "rejected" | "cancelled";
  department_name: string;
  requester_name: string;
  target_name: string;
  is_requester: boolean;
  is_target: boolean;
  can_decide: boolean;
  shift_start: string;
  shift_end: string;
  target_shift_start: string | null;
  target_shift_end: string | null;
};

function Decision({
  id,
  decision,
  label,
  variant,
  withNote,
}: {
  id: string;
  decision: "accept" | "decline" | "approve" | "reject" | "cancel";
  label: string;
  variant?: "default" | "outline" | "ghost";
  withNote?: boolean;
}) {
  // The card may disappear when the swap moves on, so success is a toast.
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await swapDecisionAction(prev, fd);
    if (r.ok && r.message) toast.success(r.message);
    return r.ok ? initialActionState : r;
  }, initialActionState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      {withNote ? (
        <Input
          name="note"
          id={`swap-${id}-${decision}-note`}
          aria-label={da.swap.rejectNote}
          placeholder={da.swap.rejectNote}
        />
      ) : null}
      <SubmitButton size="sm" variant={variant ?? "default"} data-testid={`swap-${decision}`}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** A swap in a conversation, with the buttons the current user may use. */
export function SwapCard({ swap }: { swap: SwapView }) {
  const t = da.swap;
  const exchange = swap.target_shift_start !== null;
  const open = swap.status === "proposed" || swap.status === "accepted";
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 text-sm" data-testid="swap-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <ArrowLeftRight className="size-4 text-signal" aria-hidden />
          {exchange
            ? t.exchangeTitle(swap.requester_name, swap.target_name)
            : t.giveTitle(swap.requester_name, swap.target_name)}
        </span>
        <Badge variant={open ? "secondary" : "outline"} data-testid="swap-status">
          {t.status[swap.status]}
        </Badge>
      </div>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">
            {t.shift} ({swap.requester_name})
          </dt>
          <dd className="flex items-center gap-1.5 tabular">
            <CalendarClock className="size-3.5" aria-hidden />
            {shiftWhen(swap.shift_start, swap.shift_end)} · {swap.department_name}
          </dd>
        </div>
        {exchange ? (
          <div>
            <dt className="text-xs text-muted-foreground">
              {t.theirShift} ({swap.target_name})
            </dt>
            <dd className="flex items-center gap-1.5 tabular">
              <CalendarClock className="size-3.5" aria-hidden />
              {shiftWhen(swap.target_shift_start!, swap.target_shift_end!)}
            </dd>
          </div>
        ) : null}
      </dl>
      {open ? (
        <div className="flex flex-wrap items-start gap-2">
          {swap.status === "proposed" && swap.is_target ? (
            <>
              <Decision id={swap.id} decision="accept" label={t.accept} />
              <Decision id={swap.id} decision="decline" label={t.decline} variant="outline" />
            </>
          ) : null}
          {swap.status === "accepted" && swap.can_decide ? (
            <>
              <Decision id={swap.id} decision="approve" label={t.approve} />
              <Decision
                id={swap.id}
                decision="reject"
                label={t.reject}
                variant="outline"
                withNote
              />
            </>
          ) : null}
          {swap.is_requester ? (
            <Decision id={swap.id} decision="cancel" label={t.cancel} variant="ghost" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
