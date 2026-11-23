"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, History, Pencil, Plus, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveTimeEntriesAction, unapproveTimeEntriesAction } from "@/lib/actions/time";
import { formatHours } from "@/lib/domain/numbers";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import type { TimeRow } from "@/lib/time/load";
import { da } from "@/lib/i18n/da";
import type { PostingDimension } from "@/lib/domain/posting";
import { EntryDialog, type EntryDraft, type EntrySupplements } from "./entry-dialog";
import { sumRows, type PayPreview } from "@/lib/domain/pay-preview";
import { PaySummary } from "./pay-summary";
import { decimalHours } from "@/lib/domain/project-report";
import { CompleteButton, RowDetails, StatusBadge, ViolationList, formatDay } from "./my-entries";

export type DepartmentRights = Record<string, { approve: boolean; manage: boolean }>;

export function ApprovalTable({
  rows,
  daily,
  exempt,
  rights,
  approveOwn,
  approverOf,
  previews,
  amountsFor,
  posting,
  supplements,
  dates,
}: {
  rows: TimeRow[];
  daily: Record<string, Record<string, number>>;
  exempt: string[];
  rights: DepartmentRights;
  /** Organization-wide approvers may approve their own time. */
  approveOwn: boolean;
  /** Employees the user approves personally ("Godkendes af"). */
  approverOf: string[];
  /** Pay codes the week activates, per employee. */
  previews: Record<string, PayPreview>;
  /** Employees whose amounts the user may see. */
  amountsFor: string[];
  posting: PostingDimension[];
  supplements: EntrySupplements;
  dates: string[];
}) {
  const supplementNames = Object.fromEntries(supplements.options.map((s) => [s.id, s.name]));
  const t = da.time;
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const close = useCallback(() => setDraft(null), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const employees = useMemo(() => {
    const m = new Map<string, { id: string; name: string; number: string; departmentId: string }>();
    for (const r of rows)
      if (!m.has(r.employeeId))
        m.set(r.employeeId, {
          id: r.employeeId,
          name: r.employeeName,
          number: r.employeeNumber,
          departmentId: r.departmentId,
        });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "da"));
  }, [rows]);

  // The week's pay codes summed per department (amounts only if all its employees' are visible).
  const departmentTotals = useMemo(() => {
    const out = new Map<string, { id: string; name: string; ids: string[] }>();
    for (const r of rows) {
      const d = out.get(r.departmentId) ?? { id: r.departmentId, name: r.departmentName, ids: [] };
      if (!d.ids.includes(r.employeeId)) d.ids.push(r.employeeId);
      out.set(r.departmentId, d);
    }
    return [...out.values()]
      .map((d) => ({
        ...d,
        rows: sumRows(d.ids.flatMap((id) => (previews[id] ? [previews[id]!] : []))),
        showAmounts: d.ids.every((id) => amountsFor.includes(id)),
      }))
      .filter((d) => d.rows.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  }, [rows, previews, amountsFor]);

  const approvable = (r: TimeRow) =>
    r.kind === "entry" &&
    r.status === "pending" &&
    (rights[r.departmentId]?.approve === true || approverOf.includes(r.employeeId)) &&
    (!r.isMine || approveOwn);
  const approvableIds = rows.filter(approvable).map((r) => r.entryId!);
  // The same people may undo an approval (the database refuses in a closed pay period).
  const unapprovable = (r: TimeRow) =>
    r.kind === "entry" &&
    r.status === "approved" &&
    (rights[r.departmentId]?.approve === true || approverOf.includes(r.employeeId)) &&
    (!r.isMine || approveOwn);
  const unapprovableIds = rows.filter(unapprovable).map((r) => r.entryId!);
  const unapprove = (ids: string[]) =>
    start(async () => {
      const r = await unapproveTimeEntriesAction(ids);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    });
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // One selection for both: approve acts on the waiting ones, unapprove on the approved ones.
  const toApprove = approvableIds.filter((id) => selected.has(id));
  const toUnapprove = unapprovableIds.filter((id) => selected.has(id));
  const approve = () =>
    start(async () => {
      const r = await approveTimeEntriesAction(toApprove);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      setSelected((s) => new Set([...s].filter((id) => !toApprove.includes(id))));
    });
  const selectGroup = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids)
        if (on) n.add(id);
        else n.delete(id);
      return n;
    });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 gap-4" data-testid="registrations">
        <div
          className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card/95 md:top-2 px-3 py-2 backdrop-blur"
          data-testid="approval-toolbar"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(
              [
                [t.selectPending, approvableIds, "select-pending"],
                [t.selectApproved, unapprovableIds, "select-approved"],
              ] as const
            ).map(([label, ids, testId]) => (
              <label
                key={testId}
                className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  data-testid={testId}
                  checked={ids.length > 0 && ids.every((id) => selected.has(id))}
                  onChange={(e) => selectGroup(ids, e.target.checked)}
                  disabled={ids.length === 0}
                />
                {label} ({ids.length})
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => unapprove(toUnapprove)}
              disabled={pending || toUnapprove.length === 0}
              data-testid="unapprove-selected"
            >
              <Undo2 /> {t.unapproveSelected} ({toUnapprove.length})
            </Button>
            <Button
              onClick={approve}
              disabled={pending || toApprove.length === 0}
              data-testid="approve-selected"
            >
              <CheckCheck /> {t.approveSelected} ({toApprove.length})
            </Button>
          </div>
        </div>

        {employees.map((e) => {
          const own = rows.filter((r) => r.employeeId === e.id);
          const missing = own.filter((r) => r.kind === "missing");
          const weekTotal = dates.reduce((s, d) => s + (daily[e.id]?.[d] ?? 0), 0);
          const canManage = rights[e.departmentId]?.manage === true;
          return (
            <section
              key={e.id}
              className="overflow-hidden rounded-xl border bg-card"
              data-employee={e.name}
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                <span className="font-semibold">
                  {e.name} <span className="font-normal text-muted-foreground">#{e.number}</span>
                  {exempt.includes(e.id) ? (
                    <Badge variant="secondary" className="ml-2">
                      {t.exemptBadge}
                    </Badge>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm tabular" data-testid="week-total">
                    {t.total}: {formatHours(weekTotal)} t
                  </span>
                  {canManage && missing.length ? (
                    <CompleteButton
                      shiftIds={missing.map((m) => m.shiftId!)}
                      label={`${t.completeAsPlanned} (${missing.length})`}
                    />
                  ) : null}
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t.registerFor} ${e.name}`}
                      onClick={() =>
                        setDraft({
                          mode: "create",
                          employeeId: e.id,
                          departmentId: e.departmentId,
                          date: dates[0]!,
                          employeeName: e.name,
                        })
                      }
                    >
                      <Plus />
                    </Button>
                  ) : null}
                </span>
              </header>
              <ul className="divide-y">
                {own.map((r) => (
                  <li
                    key={r.entryId ?? `m-${r.shiftId}`}
                    className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3"
                    data-testid={r.kind === "missing" ? "missing-row" : "approval-row"}
                  >
                    {approvable(r) || unapprovable(r) ? (
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        aria-label={`${approvable(r) ? t.approveSelected : t.select}: ${e.name} ${formatDay(r.date)}`}
                        checked={selected.has(r.entryId!)}
                        onChange={() => toggle(r.entryId!)}
                      />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    <div className="grid gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm capitalize">{formatDay(r.date)}</span>
                        <span className="font-semibold tabular">
                          {r.kind === "missing"
                            ? `${t.planned} ${timeRange(r.start, r.end!)}`
                            : r.end
                              ? timeRange(r.start, r.end)
                              : `${localParts(r.start).time}–`}
                        </span>
                        {r.kind === "missing" ? (
                          <Badge variant="outline">{t.missingTitle}</Badge>
                        ) : (
                          <StatusBadge row={r} />
                        )}
                        {r.departmentName ? (
                          <span className="text-xs text-muted-foreground">{r.departmentName}</span>
                        ) : null}
                      </span>
                      {r.kind === "entry" ? (
                        <RowDetails row={r} supplementNames={supplementNames} />
                      ) : null}
                      {r.entryId && previews[e.id]?.byEntry[r.entryId]?.length ? (
                        <span
                          className="flex flex-wrap gap-1 text-xs"
                          data-testid="entry-pay-codes"
                        >
                          {previews[e.id]!.byEntry[r.entryId]!.map((c) => (
                            <span key={c.payCode} className="rounded border px-1 font-mono tabular">
                              {c.payCode} {c.minutes ? `${decimalHours(c.minutes)} t` : t.fixed}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <ViolationList row={r} />
                      {r.approvedBy ? (
                        <span className="text-xs text-muted-foreground">
                          {t.statuses.approved} {t.by} {r.approvedBy}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.kind === "missing" && canManage && r.shiftId ? (
                        <>
                          <CompleteButton shiftIds={[r.shiftId]} label={t.completeAsPlanned} />
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${t.registerOtherTimes}: ${e.name} ${formatDay(r.date)}`}
                            onClick={() =>
                              setDraft({
                                mode: "create",
                                employeeId: e.id,
                                departmentId: r.departmentId,
                                date: r.date,
                                employeeName: e.name,
                                plan: {
                                  shiftId: r.shiftId!,
                                  start: r.start,
                                  end: r.end!,
                                  breaks: r.plan?.breaks ?? r.breaks,
                                },
                              })
                            }
                          >
                            <Pencil /> {t.registerOtherTimes}
                          </Button>
                        </>
                      ) : null}
                      {r.kind === "entry" && canManage && r.status === "pending" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${t.edit}: ${e.name} ${formatDay(r.date)}`}
                          onClick={() => setDraft({ mode: "edit", row: r })}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                      {unapprovable(r) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => unapprove([r.entryId!])}
                          data-testid="unapprove"
                        >
                          <Undo2 /> {t.unapprove}
                        </Button>
                      ) : null}
                      {r.kind === "entry" && canManage && r.status === "approved" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDraft({ mode: "correct", row: r })}
                        >
                          <History /> {t.correct}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <PaySummary
        departments={departmentTotals}
        employees={employees.flatMap((e) =>
          previews[e.id]?.rows.length
            ? [
                {
                  id: e.id,
                  name: e.name,
                  preview: previews[e.id]!,
                  showAmounts: amountsFor.includes(e.id),
                },
              ]
            : [],
        )}
      />
      <EntryDialog draft={draft} posting={posting} supplements={supplements} onClose={close} />
    </div>
  );
}
