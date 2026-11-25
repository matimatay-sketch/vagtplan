"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { takeOpenShiftAction, withdrawOpenShiftRequestAction } from "@/lib/actions/open-shifts";
import { daypartOf } from "@/lib/domain/daypart";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

const t = da.openShifts;
const dayFormat = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export type OpenShiftRow = {
  shiftId: string;
  departmentName: string;
  start: string;
  end: string;
  label: string | null;
  required: string[];
  missing: string[];
  requestId: string | null;
  requiresApproval: boolean;
};

/**
 * Open shifts the employee can take. A shift needing competences the employee
 * lacks on the day says so, instead of a button.
 */
export function OpenShiftList({ rows }: { rows: OpenShiftRow[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else if (r.message) toast.error(r.message);
      router.refresh();
    });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t.none}</p>;
  return (
    <ul className="grid gap-2" data-testid="open-shifts">
      {rows.map((s) => {
        const date = localParts(s.start).date;
        return (
          <li
            key={s.shiftId}
            data-daypart={daypartOf(s.start)}
            data-testid="open-shift"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-l-(color:--dp) bg-(color:--dp-surface) px-3 py-2"
          >
            <span className="grid">
              <span className="text-sm first-letter:uppercase">
                {dayFormat.format(new Date(`${date}T00:00:00Z`))}
              </span>
              <span className="text-lg font-semibold tabular">{timeRange(s.start, s.end)}</span>
              <span className="text-xs text-muted-foreground">
                {[s.departmentName, s.label].filter(Boolean).join(" · ")}
              </span>
              {s.required.length ? (
                <span
                  className={cn(
                    "mt-0.5 flex items-center gap-1 text-xs",
                    s.missing.length ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                  data-testid="open-shift-competence"
                >
                  {s.missing.length ? <ShieldAlert className="size-3.5" aria-hidden /> : null}
                  {s.missing.length
                    ? t.lacks(s.missing.join(", "))
                    : t.needs(s.required.join(", "))}
                </span>
              ) : null}
            </span>
            {s.requestId ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t.pending}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => withdrawOpenShiftRequestAction(s.requestId!))}
                >
                  {t.withdraw}
                </Button>
              </span>
            ) : s.missing.length ? null : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => takeOpenShiftAction(s.shiftId))}
                data-testid="take-open-shift"
              >
                {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
                {s.requiresApproval ? t.ask : t.take}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
