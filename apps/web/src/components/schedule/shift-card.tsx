"use client";
import * as React from "react";
import { AlertTriangle, Info, OctagonAlert, PhoneCall, Tags } from "lucide-react";
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
  // Red when the organization blocks it; amber when it is a warning or permanently overridden.
  const blocking = violations.some((v) => v.handling === "block");
  const infoOnly = !blocking && violations.every((v) => v.severity === "INFO");
  const title = violations
    .map(
      (v) =>
        `${v.handling === "block" ? da.schedule.blocking : v.severity === "INFO" ? da.schedule.info : da.schedule.warning}: ${v.message}${
          v.handling === "allow" && v.severity === "BLOCKING"
            ? ` (${da.schedule.permanentlyOverridden})`
            : ""
        }`,
    )
    .join("\n");
  const Icon = blocking ? OctagonAlert : infoOnly ? Info : AlertTriangle;
  return (
    <span
      title={title}
      className="inline-flex"
      data-testid={
        blocking ? "violation-blocking" : infoOnly ? "violation-info" : "violation-warning"
      }
    >
      <Icon
        className={cn(
          "size-3.5",
          blocking
            ? "text-destructive"
            : infoOnly
              ? "text-muted-foreground"
              : "text-warning-foreground",
        )}
        aria-label={title}
      />
    </span>
  );
}

export const ShiftCard = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { shift: BoardShift; dragging?: boolean }
>(function ShiftCard({ shift, dragging, className, ...props }, ref) {
  const blocking = shift.violations.some((v) => v.handling === "block");
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
        {shift.supplementTypeIds.length ? (
          <span
            className="rounded bg-accent px-1 text-[10px] font-medium text-accent-foreground no-underline"
            title={da.schedule.supplements}
            data-testid="supplement-badge"
          >
            +{shift.supplementTypeIds.length}
          </span>
        ) : null}
        {shift.uncovered ? (
          <span
            className="rounded bg-destructive px-1 text-[10px] font-medium text-white no-underline"
            data-testid="uncovered-badge"
          >
            {da.absence.uncovered}
          </span>
        ) : null}
        {shift.proposalId ? (
          <span
            className="rounded bg-accent px-1 text-[10px] font-medium text-accent-foreground no-underline"
            data-testid="proposal-badge"
          >
            {da.assistant.badge}
          </span>
        ) : null}
        {shift.postingAllocations.length ? (
          <span
            className="flex items-center gap-0.5 rounded bg-secondary px-1 text-[10px] font-medium text-secondary-foreground no-underline"
            title={da.posting.onShift}
            data-testid="posting-badge"
          >
            <Tags className="size-3" aria-hidden />
            {shift.postingAllocations.length}
          </span>
        ) : null}
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
