"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A <details> whose content is mounted only while open, so a page can hold
 * many edit forms without duplicate fields (and without the extra DOM).
 */
export function LazyDetails({
  summary,
  children,
  className,
  summaryClassName,
  testId,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  summaryClassName?: string;
  testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      data-testid={testId}
    >
      <summary
        className={cn(
          "min-h-9 w-fit cursor-pointer font-medium text-primary pointer-coarse:min-h-11",
          summaryClassName,
        )}
      >
        {summary}
      </summary>
      {open ? children : null}
    </details>
  );
}
