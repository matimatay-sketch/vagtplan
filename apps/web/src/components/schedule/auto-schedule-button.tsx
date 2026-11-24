"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/help/help";
import { autoScheduleAction } from "@/lib/actions/auto-schedule";
import { weekDates } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";

const t = da.autoSchedule;
const dayName = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * The built-in proposal (no AI): choose templates and days, and Turnus fills
 * the week by the employees' norms as draft shifts.
 */
export function AutoScheduleButton({
  departmentId,
  weekStart,
  templates,
}: {
  departmentId: string;
  weekStart: string;
  templates: { id: string; name: string; time: string }[];
}) {
  const dates = weekDates(weekStart);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() => templates.map((x) => x.id));
  // Monday to Friday unless the leader adds the weekend.
  const [days, setDays] = useState<string[]>(() => dates.slice(0, 5));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toggle = (list: string[], v: string, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await autoScheduleAction({ departmentId, weekStart, templateIds: chosen, days });
      if (!r.ok) return setError(r.message);
      if (r.created === 0) toast.message(t.nothing);
      else
        toast.success(
          [t.created(r.created), r.dropped ? t.dropped(r.dropped) : ""].filter(Boolean).join(" "),
        );
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="auto-schedule-button">
        <Wand2 /> {t.button}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-xl" data-testid="auto-schedule-dialog">
          <DialogHeader>
            <DialogTitle>
              {t.title}
              <HelpTip>{t.help}</HelpTip>
            </DialogTitle>
            <DialogDescription>{t.lead}</DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noTemplates}</p>
          ) : (
            <div className="grid gap-5">
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">{t.templates}</legend>
                {templates.map((tpl) => (
                  <label
                    key={tpl.id}
                    className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
                  >
                    <Checkbox
                      checked={chosen.includes(tpl.id)}
                      onChange={(e) => setChosen((c) => toggle(c, tpl.id, e.target.checked))}
                    />
                    <span>
                      {tpl.name} <span className="text-muted-foreground tabular">{tpl.time}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">{t.days}</legend>
                <div className="flex flex-wrap gap-x-4">
                  {dates.map((d) => (
                    <label
                      key={d}
                      className="flex min-h-9 cursor-pointer items-center gap-2 text-sm capitalize pointer-coarse:min-h-11"
                    >
                      <Checkbox
                        checked={days.includes(d)}
                        onChange={(e) => setDays((c) => toggle(c, d, e.target.checked))}
                      />
                      {dayName.format(new Date(`${d}T00:00:00Z`))}
                    </label>
                  ))}
                </div>
              </fieldset>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={submit}
                  disabled={busy || chosen.length === 0 || days.length === 0}
                  data-testid="auto-schedule-make"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
                  {busy ? t.making : t.make}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
