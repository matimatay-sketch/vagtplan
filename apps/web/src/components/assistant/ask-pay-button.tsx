"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
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
import { explainPayAction } from "@/lib/actions/assistant";
import { da } from "@/lib/i18n/da";

const t = da.assistant;

export function AskPayButton({
  periodId,
  employeeId,
  employeeName,
}: {
  periodId: string;
  employeeId: string;
  employeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState<string>(t.defaultPayQuestion);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const ask = () =>
    start(async () => {
      setError(null);
      setAnswer(null);
      const r = await explainPayAction({ periodId, employeeId, question });
      if (r.ok) setAnswer(r.answer);
      else setError(r.message);
    });
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="ask-pay">
        <Sparkles /> {t.ask}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="ask-pay-dialog">
          <DialogHeader>
            <DialogTitle>{t.askPayTitle}</DialogTitle>
            <DialogDescription>{employeeName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label={t.question} htmlFor="pay-question" error={error ?? undefined}>
              <Textarea
                id="pay-question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">{t.privacy}</p>
            <div>
              <Button onClick={ask} disabled={busy}>
                <Sparkles /> {busy ? t.thinking : t.send}
              </Button>
            </div>
            {answer ? (
              <div
                className="grid gap-1 rounded-lg border bg-muted/40 p-3"
                data-testid="pay-answer"
              >
                <span className="text-xs font-medium text-muted-foreground">{t.answer}</span>
                <div className="text-sm whitespace-pre-wrap">{answer}</div>
                <span className="text-xs text-muted-foreground">{t.answerNote}</span>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
