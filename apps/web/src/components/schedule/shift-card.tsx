"use client";
import * as React from "react";
import { AlertTriangle, OctagonAlert, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeRange } from "@/lib/domain/schedule-time";
import type { BoardShift } from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";

export function shiftStateLabel(s: BoardShift): string {
  if (s.removed) return da.schedule.removed;
  if (s.changed) return da.schedule.status.changed;
  return da.schedule.status[s.status];
}

export function ViolationIcon({ violations }: { violations: BoardShift["violations"] }) {
  if (!violations.length) return null;
  const blocking = violations.some((v) => v.severity === "BLOCKING");
  const title = violations
    .map(
      (v) =>
        `${v.severity === "BLOCKING" ? da.schedule.blocking : da.schedule.warning}: ${v.message}`,
    )
    .join("\n");
  const Icon = blocking ? OctagonAlert : AlertTriangle;
  return (
    <span
      title={title}
      className="inline-flex"
      data-testid={blocking ? "violation-blocking" : "violation-warning"}
    >
      <Icon
        className={cn("size-3.5", blocking ? "text-destructive" : "text-warning-foreground")}
        aria-label={title}
      />
    </span>
  );
}

export const ShiftCard = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { shift: BoardShift; dragging?: boolean }
>(function ShiftCard({ shift, dragging, className, ...props }, ref) {
  const blocking = shift.violations.some((v) => v.severity === "BLOCKING");
  return (
    <button
      ref={ref}
      type="button"
      data-testid="shift-card"
      data-shift-id={shift.id}
      data-status={shift.removed ? "removed" : shift.changed ? "changed" : shift.status}
      aria-label={`${timeRange(shift.start, shift.end)} ${shift.label ?? ""} – ${shiftStateLabel(shift)}`}
      className={cn(
        "group/shift relative flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs leading-tight transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
        shift.kind === "on_call"
          ? "border-primary/30 bg-secondary"
          : "border-primary/20 bg-primary/10",
        shift.status === "draft" && !shift.removed && "border-dashed bg-card",
        shift.changed && "border-l-4 border-l-warning",
        shift.removed && "opacity-60 line-through",
        blocking && "ring-1 ring-destructive/60",
        dragging && "shadow-lg ring-2 ring-signal",
        className,
      )}
      {...props}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="font-semibold tabular">{timeRange(shift.start, shift.end)}</span>
        <ViolationIcon violations={shift.violations} />
      </span>
      <span className="flex items-center gap-1 truncate text-muted-foreground">
        {shift.kind === "on_call" ? <PhoneCall className="size-3" /> : null}
        {shift.label ?? (shift.kind === "on_call" ? da.schedule.kinds.on_call : "")}
        {shift.status === "draft" && !shift.removed ? (
          <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground no-underline">
            {shift.changed ? da.schedule.badge.changed : da.schedule.badge.draft}
          </span>
        ) : null}
      </span>
    </button>
  );
});
