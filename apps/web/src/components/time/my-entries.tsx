"use client";
import { useCallback, useState, useTransition } from "react";
import { AlertTriangle, CheckCheck, CloudOff, FolderKanban, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { completeAsPlannedAction } from "@/lib/actions/time";
import { deviation } from "@/lib/domain/time-entries";
import { formatHours } from "@/lib/domain/numbers";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import type { BoardProject } from "@/lib/schedule/load-week";
import type { TimeRow } from "@/lib/time/load";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";
import { EntryDialog, type EntryDraft } from "./entry-dialog";

const dayLabel = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
export const formatDay = (d: string) => dayLabel.format(new Date(`${d}T00:00:00Z`));

export function StatusBadge({ row }: { row: TimeRow }) {
  if (!row.status) return null;
  return (
    <Badge
      variant={row.status === "approved" ? "default" : "secondary"}
      className={cn(row.status === "open" && "bg-primary/15 text-primary")}
    >
      {da.time.statuses[row.status]}
    </Badge>
  );
}

/** "+15 / −10 min" against the plan, or nothing when on plan. */
export function DeviationText({ row }: { row: TimeRow }) {
  if (!row.plan || !row.end) return null;
  const d = deviation({ start: row.start, end: row.end }, row.plan);
  if (d.start === 0 && d.end === 0) return null;
  const f = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  return (
    <span className="text-xs text-warning-foreground tabular" title={da.time.deviation}>
      {da.time.deviation}: {f(d.total)} min
    </span>
  );
}

const sameInstant = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  new Date(a.start).getTime() === new Date(b.start).getTime() &&
  new Date(a.end).getTime() === new Date(b.end).getTime();

export function RowDetails({ row }: { row: TimeRow }) {
  const t = da.time;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {row.workKind === "call_out" ? (
        <span
          className="rounded bg-signal/20 px-1 font-medium text-foreground"
          data-testid="call-out-badge"
        >
          {t.callOut}
        </span>
      ) : null}
      {row.source ? <span>{t.sources[row.source]}</span> : null}
      {row.plan ? (
        <span className="tabular">
          {t.planned} {timeRange(row.plan.start, row.plan.end)}
        </span>
      ) : (
        <span>{t.noPlan}</span>
      )}
      {row.settled && row.end && !sameInstant(row.settled, { start: row.start, end: row.end }) ? (
        <span className="tabular" title={t.settledHelp}>
          {t.settled} {timeRange(row.settled.start, row.settled.end)}
        </span>
      ) : null}
      <DeviationText row={row} />
      {row.projectAllocations.length ? (
        <span className="inline-flex items-center gap-1">
          <FolderKanban className="size-3" /> {row.projectAllocations.length}
        </span>
      ) : null}
      {row.offline ? (
        <span className="inline-flex items-center gap-1">
          <CloudOff className="size-3" /> {t.offline}
        </span>
      ) : null}
      {row.version > 1 ? <span>{t.version(row.version)}</span> : null}
      {row.deviationReason ? <span>“{row.deviationReason}”</span> : null}
    </span>
  );
}

export function ViolationList({ row }: { row: TimeRow }) {
  if (!row.violations.length) return null;
  return (
    <ul className="mt-1 grid gap-0.5 text-xs" data-testid="time-violations">
      {row.violations.map((v, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-1",
            v.severity === "BLOCKING" ? "text-destructive" : "text-warning-foreground",
          )}
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {v.message}
        </li>
      ))}
    </ul>
  );
}

export function CompleteButton({
  shiftIds,
  label,
  size = "sm",
}: {
  shiftIds: string[];
  label: string;
  size?: "sm" | "default";
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => void (await completeAsPlannedAction(shiftIds)))}
    >
      <CheckCheck /> {label}
    </Button>
  );
}

export function MyEntries({
  rows,
  daily,
  projects,
  employeeId,
  dates,
}: {
  rows: TimeRow[];
  daily: Record<string, number>;
  projects: (BoardProject & { departmentIds: string[] })[];
  employeeId: string;
  /** Newest first. */
  dates: string[];
}) {
  const t = da.time;
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const close = useCallback(() => setDraft(null), []);
  const missing = rows.filter((r) => r.kind === "missing");

  return (
    <div className="grid gap-6">
      {missing.length ? (
        <section
          className="rounded-xl border border-warning/40 bg-warning/10 p-4"
          data-testid="missing"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t.missingTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.missingLead}</p>
            </div>
            {missing.length > 1 ? (
              <CompleteButton
                shiftIds={missing.map((m) => m.shiftId!)}
                label={`${t.completeAsPlanned} (${missing.length})`}
              />
            ) : null}
          </div>
          <ul className="grid gap-2">
            {missing.map((m) => (
              <li
                key={m.shiftId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card p-3"
                data-testid="missing-shift"
              >
                <span>
                  <span className="font-medium capitalize">{formatDay(m.date)}</span>{" "}
                  <span className="tabular">{timeRange(m.start, m.end!)}</span>{" "}
                  <span className="text-sm text-muted-foreground">{m.departmentName}</span>
                </span>
                <CompleteButton shiftIds={[m.shiftId!]} label={t.completeAsPlanned} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.myEntries}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({ mode: "create", employeeId, departmentId: null, date: dates[0]! })
            }
          >
            <Plus /> {t.newEntry}
          </Button>
        </div>
        <ol className="grid gap-3" data-testid="my-entries">
          {dates.map((date) => {
            const entries = rows.filter((r) => r.kind === "entry" && r.date === date);
            if (entries.length === 0 && !daily[date]) return null;
            return (
              <li key={date} className="rounded-xl border bg-card" data-date={date}>
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="font-medium capitalize">{formatDay(date)}</span>
                  <span className="text-sm tabular" data-testid="day-total">
                    {t.dayTotal}: {formatHours(daily[date] ?? 0)} t
                  </span>
                </div>
                <ul className="divide-y">
                  {entries.map((r) => {
                    const editable = r.status === "pending";
                    return (
                      <li key={r.entryId} className="px-4 py-3" data-testid="time-entry">
                        <button
                          type="button"
                          className={cn(
                            "grid w-full gap-1 text-left",
                            editable ? "cursor-pointer" : "cursor-default",
                          )}
                          onClick={() => editable && setDraft({ mode: "edit", row: r })}
                          disabled={!editable}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tabular">
                              {r.end ? timeRange(r.start, r.end) : `${localParts(r.start).time}–`}
                            </span>
                            <StatusBadge row={r} />
                          </span>
                          <RowDetails row={r} />
                          <ViolationList row={r} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>
      <EntryDialog draft={draft} projects={projects} onClose={close} />
    </div>
  );
}
