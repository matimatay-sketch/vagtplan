"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/form";
import { proposeScheduleAction } from "@/lib/actions/assistant";
import { da } from "@/lib/i18n/da";

const t = da.assistant;

export function ProposeButton({
  departmentId,
  weekStart,
}: {
  departmentId: string;
  weekStart: string;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await proposeScheduleAction({ departmentId, weekStart, instructions });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast.success(
        [
          t.created(r.created),
          r.skipped ? t.skipped(r.skipped) : "",
          r.blocking ? t.blocking(r.blocking) : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setOpen(false);
      setInstructions("");
      router.refresh();
    });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="propose-button">
        <Sparkles /> {t.propose}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-xl" data-testid="propose-dialog">
          <DialogHeader>
            <DialogTitle>{t.proposeTitle}</DialogTitle>
            <DialogDescription>{t.proposeLead}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label={t.instructions} htmlFor="instructions" error={error ?? undefined}>
              <Textarea
                id="instructions"
                rows={5}
                value={instructions}
                placeholder={t.instructionsPlaceholder}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">{t.privacy}</p>
            <div>
              <Button onClick={submit} disabled={busy || instructions.trim().length < 3}>
                <Sparkles /> {busy ? t.proposing : t.propose}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
