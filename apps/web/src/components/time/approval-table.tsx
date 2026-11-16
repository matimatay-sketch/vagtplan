"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, History, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveTimeEntriesAction } from "@/lib/actions/time";
import { formatHours } from "@/lib/domain/numbers";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import type { BoardProject } from "@/lib/schedule/load-week";
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
  projects,
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
  projects: (BoardProject & { departmentIds: string[] })[];
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
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const approve = () =>
    start(async () => {
      const r = await approveTimeEntriesAction([...selected]);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      setSelected(new Set());
    });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 gap-4" data-testid="registrations">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={approvableIds.length > 0 && approvableIds.every((id) => selected.has(id))}
              onChange={(e) => setSelected(new Set(e.target.checked ? approvableIds : []))}
              disabled={approvableIds.length === 0}
            />
            {t.selectAll} ({approvableIds.length})
          </label>
          <Button
            onClick={approve}
            disabled={pending || selected.size === 0}
            data-testid="approve-selected"
          >
            <CheckCheck /> {t.approveSelected} ({selected.size})
          </Button>
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
                    {approvable(r) ? (
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        aria-label={`${t.approveSelected}: ${e.name} ${formatDay(r.date)}`}
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
                    <div className="flex gap-1">
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
      <EntryDialog
        draft={draft}
        projects={projects}
        posting={posting}
        supplements={supplements}
        onClose={close}
      />
    </div>
  );
}
