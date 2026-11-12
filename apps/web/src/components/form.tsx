"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";

export function Field({
  label,
  htmlFor,
  error,
  help,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string | undefined;
  help?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const helpId = `${htmlFor}-help`;
  const errorId = `${htmlFor}-error`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && !error ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Spread on an input to wire aria-invalid and the error description. */
export function fieldProps(name: string, state: ActionState, fallback?: string | null) {
  const error = state.errors?.[name];
  return {
    id: name,
    name,
    defaultValue: state.values?.[name] ?? fallback ?? undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
  } as const;
}

export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  const hasErrors = state.errors && Object.keys(state.errors).length > 0;
  const message = state.message ?? (hasErrors ? da.validation.fixErrors : undefined);
  if (!message) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
