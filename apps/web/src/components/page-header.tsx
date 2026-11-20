import * as React from "react";
import Link from "next/link";

export function PageHeader({
  title,
  lead,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <div className="mb-2 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {lead ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

/** An empty list says what is missing and, where possible, what to do next. */
export function EmptyState({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string } | null;
}) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      <div>{children}</div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex min-h-9 items-center rounded-md border bg-card px-4 font-medium text-foreground shadow-xs transition-colors hover:bg-muted pointer-coarse:min-h-11"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
