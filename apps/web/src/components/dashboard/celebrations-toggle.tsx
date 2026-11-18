"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setShowCelebrationsAction } from "@/lib/actions/bulletin";
import { da } from "@/lib/i18n/da";

export function CelebrationsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, start] = useTransition();
  return (
    <label className="flex items-start gap-2 text-sm" data-testid="celebrations-toggle">
      <Checkbox
        checked={on}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const r = await setShowCelebrationsAction(next);
            if (r.ok) toast.success(r.message);
            else {
              setOn(!next);
              toast.error(r.message);
            }
          });
        }}
      />
      <span>
        {da.dashboard.showCelebrations}
        <span className="block text-xs text-muted-foreground">
          {da.dashboard.showCelebrationsHelp}
        </span>
      </span>
    </label>
  );
}
