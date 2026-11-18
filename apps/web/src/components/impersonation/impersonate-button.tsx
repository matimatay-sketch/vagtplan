"use client";
import { useState, useTransition } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { impersonateAction } from "@/lib/actions/impersonation";
import { da } from "@/lib/i18n/da";

export function ImpersonateButton({ employeeId, name }: { employeeId: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        disabled={busy}
        data-testid="impersonate"
        onClick={() => {
          if (!window.confirm(da.impersonation.confirm(name))) return;
          start(async () => {
            const r = await impersonateAction(employeeId);
            if (r?.message) setError(r.message);
          });
        }}
      >
        <LogIn /> {da.impersonation.button}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
