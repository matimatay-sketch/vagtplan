"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideOpenShiftRequestAction } from "@/lib/actions/open-shifts";
import { decideAbsenceAction } from "@/lib/actions/absence";
import { da } from "@/lib/i18n/da";

const t = da.activities;

/** Godkend / Afvis on a request in Aktiviteter. */
export function DecisionButtons({
  kind,
  id,
  label,
}: {
  kind: "open_shift" | "absence";
  id: string;
  /** For screen readers: what is decided. */
  label: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const decide = (approve: boolean) =>
    start(async () => {
      const r =
        kind === "open_shift"
          ? await decideOpenShiftRequestAction(id, approve)
          : await decideAbsenceAction(id, approve, "");
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => decide(true)}
        aria-label={`${t.approve}: ${label}`}
        data-testid="approve"
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check className="text-success" />}
        {t.approve}
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => decide(false)}
        aria-label={`${t.reject}: ${label}`}
        data-testid="reject"
      >
        <X className="text-destructive" />
        {t.reject}
      </Button>
    </div>
  );
}
