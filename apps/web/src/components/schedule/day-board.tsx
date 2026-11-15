"use client";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { barPosition, localParts, timeRange } from "@/lib/domain/schedule-time";
import { resizeShiftAction } from "@/lib/actions/schedule";
import { trackSaving } from "@/lib/schedule/saving";
import type { BoardShift, WeekBoard as Board } from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";
import { ViolationIcon } from "./shift-card";
import { ShiftDialog, type ShiftDraft } from "./shift-dialog";

const SNAP = 15;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) =>
  `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Pauses live refreshes while a bar is being resized (see RealtimeRefresh). */
function setScheduleBusy(busy: boolean) {
  if (busy) document.body.dataset.scheduleBusy = "1";
  else delete document.body.dataset.scheduleBusy;
}

type Drag = {
  shiftId: string;
  edge: "start" | "end";
  startMinute: number;
  endMinute: number;
  rowWidth: number;
  originX: number;
};

/** Local wall-clock minutes of a shift relative to `date` (end may pass 1440). */
function wallMinutes(s: BoardShift, date: string) {
  const a = localParts(s.start);
  const b = localParts(s.end);
  const start = a.date === date ? toMinutes(a.time) : 0;
  const end = b.date === date ? toMinutes(b.time) : 1440 + (b.date > date ? toMinutes(b.time) : 0);
  return { start, end };
}

function Bar({
  shift,
  date,
  canManage,
  preview,
  onOpen,
  onResizeStart,
}: {
  shift: BoardShift;
  date: string;
  canManage: boolean;
  preview: { start: number; end: number } | null;
  onOpen: () => void;
  onResizeStart: (edge: "start" | "end", e: React.PointerEvent) => void;
}) {
  const pos = preview
    ? {
        left: preview.start / 1440,
        width: (Math.min(preview.end, 1440) - preview.start) / 1440,
        clippedStart: false,
        clippedEnd: preview.end > 1440,
      }
    : barPosition(shift.start, shift.end, date);
  if (!pos) return null;
  const startsToday = localParts(shift.start).date === date;
  const resizable = canManage && !shift.removed && startsToday;
  return (
    <div
      className={cn(
        "absolute inset-y-1.5 flex items-center overflow-hidden rounded-md border text-xs",
        shift.status === "draft"
          ? "border-dashed border-primary/40 bg-card"
          : "border-primary/30 bg-primary/15",
        shift.changed && "border-l-4 border-l-warning",
        shift.removed && "opacity-50 line-through",
        shift.violations.some((v) => v.severity === "BLOCKING") && "ring-1 ring-destructive/60",
      )}
      style={{ left: `${pos.left * 100}%`, width: `${pos.width * 100}%` }}
      data-testid="day-bar"
      data-shift-id={shift.id}
    >
      {resizable && !pos.clippedStart ? (
        <span
          role="separator"
          aria-label={`${da.schedule.start} – ${da.schedule.resizeHint}`}
          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-signal/50"
          onPointerDown={(e) => onResizeStart("start", e)}
          data-testid="resize-start"
        />
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left"
      >
        <span className="truncate font-semibold tabular">
          {preview
            ? `${fmt(preview.start)}–${fmt(preview.end)}`
            : timeRange(shift.start, shift.end)}
        </span>
        <span className="truncate text-muted-foreground">{shift.label}</span>
        <ViolationIcon violations={shift.violations} />
      </button>
      {resizable && !pos.clippedEnd ? (
        <span
          role="separator"
          aria-label={`${da.schedule.end} – ${da.schedule.resizeHint}`}
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-signal/50"
          onPointerDown={(e) => onResizeStart("end", e)}
          data-testid="resize-end"
        />
      ) : null}
    </div>
  );
}

export function DayBoard({ board, date }: { board: Board; date: string }) {
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);
  const [preview, setPreview] = React.useState<{ id: string; start: number; end: number } | null>(
    null,
  );
  const previewRef = React.useRef<{ id: string; start: number; end: number } | null>(null);
  const showPreview = (p: { id: string; start: number; end: number } | null) => {
    previewRef.current = p;
    setPreview(p);
  };

  // Reset the local preview whenever fresh data arrives from the server.
  const [prevBoard, setPrevBoard] = React.useState(board);
  if (board !== prevBoard) {
    setPrevBoard(board);
    setPreview(null);
  }

  // Listeners are attached in the pointerdown handler itself (not in an effect after a
  // re-render), so a fast drag cannot move or release before they exist.
  const beginResize = (drag: Drag) => {
    const move = (e: PointerEvent) => {
      const delta = Math.round((((e.clientX - drag.originX) / drag.rowWidth) * 1440) / SNAP) * SNAP;
      const start =
        drag.edge === "start"
          ? Math.min(Math.max(0, drag.startMinute + delta), drag.endMinute - SNAP)
          : drag.startMinute;
      const end =
        drag.edge === "end"
          ? Math.max(Math.min(2880, drag.endMinute + delta), drag.startMinute + SNAP)
          : drag.endMinute;
      showPreview({ id: drag.shiftId, start, end });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      setScheduleBusy(false);
      const p = previewRef.current;
      if (!p || (p.start === drag.startMinute && p.end === drag.endMinute)) {
        showPreview(null);
        return;
      }
      void trackSaving(
        resizeShiftAction({ id: p.id, date, startMinute: p.start, endMinute: p.end }),
      ).then((r) => {
        if (!r.ok) {
          toast.error(r.message ?? da.common.unknownError);
          showPreview(null);
        }
      });
    };
    setScheduleBusy(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const rows: { id: string; name: string; employeeId: string | null }[] = [
    { id: "open", name: da.schedule.openShifts, employeeId: null },
    ...board.employees.map((e) => ({ id: e.id, name: e.name, employeeId: e.id })),
  ];

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card" data-testid="day-board">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[12rem_1fr] border-b text-[11px] text-muted-foreground">
            <div className="px-3 py-2 font-medium uppercase">{da.schedule.employee}</div>
            <div className="relative h-8">
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute top-2 -translate-x-1/2 tabular"
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => {
            const shifts = board.shifts.filter(
              (s) => (s.employeeId ?? null) === row.employeeId && barPosition(s.start, s.end, date),
            );
            return (
              <div
                key={row.id}
                className="grid grid-cols-[12rem_1fr] border-b last:border-0"
                data-row={row.name}
              >
                <div className="truncate px-3 py-3 text-sm font-medium">{row.name}</div>
                <div
                  className="relative h-12 cursor-copy bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[length:calc(100%/24)_100%]"
                  onDoubleClick={() =>
                    board.canManage && setDraft({ employeeId: row.employeeId, date })
                  }
                >
                  {shifts.map((s) => (
                    <Bar
                      key={s.id}
                      shift={s}
                      date={date}
                      canManage={board.canManage}
                      preview={preview?.id === s.id ? preview : null}
                      onOpen={() => setDraft({ shift: s, employeeId: s.employeeId, date })}
                      onResizeStart={(edge, e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rowEl = (e.currentTarget as HTMLElement).closest("[data-row]")
                          ?.lastElementChild as HTMLElement;
                        const { start, end } = wallMinutes(s, date);
                        previewRef.current = null;
                        beginResize({
                          shiftId: s.id,
                          edge,
                          startMinute: start,
                          endMinute: end,
                          rowWidth: rowEl.getBoundingClientRect().width,
                          originX: e.clientX,
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{da.schedule.resizeHint}</p>
      <ShiftDialog
        draft={draft}
        onClose={() => setDraft(null)}
        departmentId={board.departmentId}
        employees={board.employees}
        templates={board.templates}
        supplementTypes={board.supplementTypes}
        projects={board.projects}
        posting={board.posting}
      />
    </>
  );
}
