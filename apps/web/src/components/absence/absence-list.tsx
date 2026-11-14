"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelAbsenceAction, decideAbsenceAction } from "@/lib/actions/absence";
import { formatDays } from "@/lib/domain/leave";
import { formatDate } from "@/lib/format";
import type { AbsenceRow } from "@/lib/absence/load";
import { da } from "@/lib/i18n/da";

export type ListedAbsence = AbsenceRow & { employeeName?: string; typeLabel: string };

const statusVariant = {
  requested: "secondary",
  approved: "default",
  rejected: "outline",
  cancelled: "outline",
} as const;

export function AbsenceList({
  rows,
  decide = false,
  cancelApproved = false,
  testId,
}: {
  rows: ListedAbsence[];
  /** Show approve/reject for requests. */
  decide?: boolean;
  /** May cancel approved absences (managers). Requests can always be cancelled by their owner. */
  cancelApproved?: boolean;
  testId?: string;
}) {
  const t = da.absence;
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t.none}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card" data-testid={testId}>
      {rows.map((a) => (
        <li key={a.id} className="grid gap-2 px-4 py-3" data-testid="absence-row">
          <div className="flex flex-wrap items-center gap-2">
            {a.employeeName ? <span className="font-semibold">{a.employeeName}</span> : null}
            <span className="font-medium">{a.typeLabel}</span>
            <span className="text-sm tabular">
              {formatDate(a.from)}
              {a.to !== a.from ? ` – ${formatDate(a.to)}` : ""}
            </span>
            <Badge variant={statusVariant[a.status]}>{t.statuses[a.status]}</Badge>
            {a.daysHundredths ? (
              <span className="text-xs text-muted-foreground">
                {t.leaveDays(formatDays(a.daysHundredths))}
              </span>
            ) : null}
          </div>
          {a.note || a.decisionNote ? (
            <p className="text-sm text-muted-foreground">
              {a.note ? `“${a.note}”` : null}
              {a.decisionNote ? ` · ${a.decisionNote}` : null}
            </p>
          ) : null}
          {(decide && a.status === "requested") ||
          a.status === "requested" ||
          (cancelApproved && a.status === "approved") ? (
            <div className="flex flex-wrap items-center gap-2">
              {decide && a.status === "requested" ? (
                <>
                  <Input
                    className="h-8 max-w-64"
                    placeholder={t.decisionNote}
                    aria-label={`${t.decisionNote}: ${a.employeeName ?? ""}`}
                    value={notes[a.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => decideAbsenceAction(a.id, true, notes[a.id] ?? ""))}
                  >
                    <Check /> {t.approve}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => decideAbsenceAction(a.id, false, notes[a.id] ?? ""))}
                  >
                    <X /> {t.reject}
                  </Button>
                </>
              ) : null}
              {a.status === "requested" || (cancelApproved && a.status === "approved") ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => cancelAbsenceAction(a.id))}
                >
                  {t.cancel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
