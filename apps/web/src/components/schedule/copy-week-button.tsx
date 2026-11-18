"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/form";
import { copyPreviousWeekAction, copyWeekAction } from "@/lib/actions/schedule";
import { weekTargets } from "@/lib/domain/schedule-copy";
import { addDays } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";

const t = da.schedule;

/** Copy the previous week here, or this week to the next weeks or a chosen week. */
export function CopyWeekButton({
  departmentId,
  weekStart,
}: {
  departmentId: string;
  weekStart: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"previous" | "next" | "week">("next");
  const [weeks, setWeeks] = useState(1);
  const [date, setDate] = useState(addDays(weekStart, 7));
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = (r: { ok?: boolean; message?: string }) => {
    if (r.ok) {
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    } else toast.message(r.message ?? da.common.unknownError);
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="copy-week">
        <Copy /> {t.copyMenu}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="copy-week-dialog">
          <DialogHeader>
            <DialogTitle>{t.copyMenu}</DialogTitle>
            <DialogDescription>{t.copyShiftLead}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            {(
              [
                ["previous", t.copyPrevious],
                ["next", `${t.copyThisWeek} ${t.copyNext.toLowerCase()}`],
                ["week", `${t.copyThisWeek} ${t.copyToWeek.toLowerCase()}`],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="copy-mode"
                  className="accent-primary"
                  checked={mode === k}
                  onChange={() => setMode(k)}
                />
                {label}
              </label>
            ))}
            {mode === "next" ? (
              <Field label={t.copyWeeks} htmlFor="copy-weeks">
                <NativeSelect
                  id="copy-weeks"
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            {mode === "week" ? (
              <Field label={t.copyToWeekDate} htmlFor="copy-date">
                <Input
                  id="copy-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            ) : null}
            <div>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (mode === "previous")
                      return done(await copyPreviousWeekAction({ departmentId, weekStart }));
                    const toWeeks = weekTargets(
                      weekStart,
                      mode === "next" ? { kind: "next", weeks } : { kind: "week", date },
                    );
                    if (toWeeks.length === 0) return done({ message: t.copyNone });
                    done(await copyWeekAction({ departmentId, fromWeek: weekStart, toWeeks }));
                  })
                }
              >
                <Copy /> {t.copyDo}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
