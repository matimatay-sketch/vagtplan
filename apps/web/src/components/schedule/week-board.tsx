"use client";
import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { localParts } from "@/lib/domain/schedule-time";
import { formatHours } from "@/lib/domain/numbers";
import { moveShiftAction } from "@/lib/actions/schedule";
import { trackSaving } from "@/lib/schedule/saving";
import type {
  BoardAvailability,
  BoardEmployee,
  BoardShift,
  WeekBoard as Board,
} from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";
import { ShiftCard, ViolationIcon } from "./shift-card";
import { ShiftDialog, type ShiftDraft } from "./shift-dialog";

const OPEN = "open";
const dayFormat = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "30 / 37 t": planned hours against the contract norm for the week. */
function NormHours({ planned, norm }: { planned: number; norm: number | null }) {
  if (norm === null) return <span title={da.schedule.noNorm}>{formatHours(planned)} t</span>;
  const tone =
    planned > norm
      ? "text-warning-foreground font-medium"
      : planned === norm
        ? "text-success font-medium"
        : "";
  return (
    <span
      className={tone}
      title={`${da.schedule.norm}: ${formatHours(norm)} t`}
      data-testid="norm-hours"
    >
      {da.schedule.hoursOfNorm(formatHours(planned), formatHours(norm))}
    </span>
  );
}

function availabilityTone(kind: BoardAvailability["kind"]) {
  switch (kind) {
    case "unavailable":
      return "bg-destructive/10 text-destructive";
    case "wish_off":
      return "bg-warning/20 text-warning-foreground";
    case "wish_work":
    case "available":
      return "bg-success/15 text-success";
  }
}

function DraggableShift({
  shift,
  canManage,
  onOpen,
}: {
  shift: BoardShift;
  canManage: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: shift.id,
    disabled: !canManage || shift.removed,
  });
  return (
    <ShiftCard
      ref={setNodeRef}
      shift={shift}
      className={cn(isDragging && "opacity-30")}
      onClick={onOpen}
      {...(canManage ? listeners : {})}
      {...(canManage ? attributes : {})}
    />
  );
}

function Cell({
  id,
  children,
  onCreate,
  canManage,
  today,
}: {
  id: string;
  children: React.ReactNode;
  onCreate: () => void;
  canManage: boolean;
  today: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canManage });
  return (
    <td
      ref={setNodeRef}
      data-cell={id}
      className={cn(
        "group/cell relative h-full min-w-32 border-l p-1.5 align-top transition-colors",
        today && "bg-accent/30",
        isOver && "bg-signal/15",
      )}
    >
      <div className="flex min-h-14 flex-col gap-1">
        {children}
        {canManage ? (
          <button
            type="button"
            onClick={onCreate}
            aria-label={da.schedule.newShift}
            className="mt-auto flex h-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-muted focus-visible:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
    </td>
  );
}

export function WeekBoard({
  board,
  dates,
  today,
}: {
  board: Board;
  dates: string[];
  today: string;
}) {
  const dndId = React.useId(); // stable ids for dnd-kit's a11y attributes (avoids hydration mismatch)
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [optimistic, setOptimistic] = React.useState<
    Record<string, { employeeId: string | null; date: string }>
  >({});
  const altKey = React.useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Drop optimistic moves whenever fresh data arrives from the server.
  const [prevBoard, setPrevBoard] = React.useState(board);
  if (board !== prevBoard) {
    setPrevBoard(board);
    setOptimistic({});
  }
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => (altKey.current = e.altKey);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
    };
  }, []);

  const placed = board.shifts.map((s) => {
    const o = optimistic[s.id];
    return {
      shift: s,
      employeeId: o ? o.employeeId : s.employeeId,
      date: o ? o.date : localParts(s.start).date,
    };
  });
  const rows: { id: string; employee: BoardEmployee | null }[] = [
    { id: OPEN, employee: null },
    ...board.employees.map((e) => ({ id: e.id, employee: e })),
  ];

  const onDragStart = (e: DragStartEvent) => {
    altKey.current =
      altKey.current || Boolean((e.activatorEvent as PointerEvent | KeyboardEvent).altKey);
    setActiveId(String(e.active.id));
    document.body.dataset.scheduleBusy = "1";
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    delete document.body.dataset.scheduleBusy;
    if (!e.over) return;
    const [rowId, date] = String(e.over.id).split("|") as [string, string];
    const shift = board.shifts.find((s) => s.id === e.active.id);
    if (!shift) return;
    const employeeId = rowId === OPEN ? null : rowId;
    const copy = altKey.current;
    if (!copy && employeeId === shift.employeeId && date === localParts(shift.start).date) return;
    if (!copy) setOptimistic((o) => ({ ...o, [shift.id]: { employeeId, date } }));
    const r = await trackSaving(moveShiftAction({ id: shift.id, employeeId, date, copy }));
    if (!r.ok) {
      toast.error(r.message ?? da.common.unknownError);
      setOptimistic((o) => {
        const { [shift.id]: _gone, ...rest } = o;
        return rest;
      });
    }
  };
  const active = board.shifts.find((s) => s.id === activeId);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        delete document.body.dataset.scheduleBusy;
      }}
    >
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[960px] border-collapse text-sm" data-testid="week-board">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 w-48 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                {da.schedule.employee}
              </th>
              {dates.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "border-l px-2 py-2 text-left text-xs font-medium capitalize",
                    d === today ? "text-signal" : "text-muted-foreground",
                  )}
                >
                  {dayFormat.format(new Date(`${d}T00:00:00Z`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, employee }) => (
              <tr
                key={id}
                className={cn("border-b last:border-0", id === OPEN && "bg-muted/40")}
                data-row={employee?.name ?? da.schedule.openShifts}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left align-top font-normal"
                >
                  {employee ? (
                    <div className="grid gap-0.5">
                      <span className="flex items-center gap-1.5 font-medium">
                        {employee.name}
                        <ViolationIcon violations={employee.violations} />
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular">
                        <NormHours planned={employee.weekMinutes} norm={employee.normMinutes} />
                        {employee.young ? (
                          <span className="rounded bg-warning/25 px-1 text-warning-foreground">
                            U18
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {da.schedule.openShifts}
                    </span>
                  )}
                </th>
                {dates.map((date) => (
                  <Cell
                    key={date}
                    id={`${id}|${date}`}
                    canManage={board.canManage}
                    today={date === today}
                    onCreate={() => setDraft({ employeeId: employee?.id ?? null, date })}
                  >
                    {employee
                      ? board.absences
                          .filter(
                            (a) => a.employeeId === employee.id && a.from <= date && date <= a.to,
                          )
                          .map((a) => (
                            <span
                              key={a.id}
                              data-testid="absence-chip"
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                a.status === "approved"
                                  ? "bg-destructive/10 text-destructive"
                                  : "border border-dashed border-destructive/40 text-destructive",
                              )}
                            >
                              {a.label}
                              {a.status === "requested"
                                ? ` (${da.absence.statuses.requested.toLowerCase()})`
                                : ""}
                            </span>
                          ))
                      : null}
                    {employee
                      ? board.availability
                          .filter((a) => a.employeeId === employee.id && a.date === date)
                          .map((a) => (
                            <span
                              key={a.id}
                              title={a.note ?? undefined}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                availabilityTone(a.kind),
                              )}
                            >
                              {da.schedule.availability[a.kind]}
                              {a.from ? ` ${a.from}–${a.to}` : ""}
                            </span>
                          ))
                      : null}
                    {placed
                      .filter((p) => (p.employeeId ?? OPEN) === id && p.date === date)
                      .map(({ shift }) => (
                        <DraggableShift
                          key={shift.id}
                          shift={shift}
                          canManage={board.canManage}
                          onOpen={() => setDraft({ shift, employeeId: shift.employeeId, date })}
                        />
                      ))}
                  </Cell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {active ? <ShiftCard shift={active} dragging className="w-36" /> : null}
      </DragOverlay>
      <ShiftDialog
        draft={draft}
        onClose={() => setDraft(null)}
        departmentId={board.departmentId}
        employees={board.employees}
        templates={board.templates}
        supplementTypes={board.supplementTypes}
        projects={board.projects}
      />
    </DndContext>
  );
}
