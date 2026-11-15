"use client";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { rerollAction, rolloutAction } from "@/lib/actions/rotation";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Line = { id: string; name: string };
type Employee = { id: string; name: string };
type Row = { lineId: string; employeeId: string; startWeek: number };

export function RolloutForm({
  rotationId,
  lengthWeeks,
  lines,
  employees,
  defaultStart,
}: {
  rotationId: string;
  lengthWeeks: number;
  lines: Line[];
  employees: Employee[];
  defaultStart: string;
}) {
  const t = da.turnus;
  const [state, action] = useActionState(rolloutAction, initialActionState);
  // Default: line k starts in rotation week k, so a rotation covers all weeks.
  const [rows, setRows] = React.useState<Row[]>(() =>
    lines.map((l, i) => ({ lineId: l.id, employeeId: "", startWeek: i % lengthWeeks })),
  );
  const [included, setIncluded] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, true])),
  );
  const assignments = rows
    .filter((r) => included[r.lineId])
    .map((r) => ({ lineId: r.lineId, employeeId: r.employeeId || null, startWeek: r.startWeek }));
  const update = (lineId: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)));
  React.useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-4" noValidate data-testid="rollout-form">
      <input type="hidden" name="rotation_id" value={rotationId} />
      <input type="hidden" name="assignments" value={JSON.stringify(assignments)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.startDate} htmlFor="start_date" error={state.errors?.start_date}>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={state.values?.start_date ?? defaultStart}
          />
        </Field>
        <Field label={t.rolloutWeeks} htmlFor="weeks" error={state.errors?.weeks}>
          <Input
            id="weeks"
            name="weeks"
            type="number"
            min={1}
            max={104}
            defaultValue={state.values?.weeks ?? String(Math.max(lengthWeeks, 4))}
          />
        </Field>
      </div>
      <div className="grid gap-2">
        {rows.map((r) => {
          const line = lines.find((l) => l.id === r.lineId)!;
          return (
            <div
              key={r.lineId}
              className="grid grid-cols-[auto_1fr_1.5fr_1fr] items-center gap-2"
              data-testid="rollout-line"
              data-line={line.name}
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={included[r.lineId] ?? false}
                onChange={(e) => setIncluded((x) => ({ ...x, [r.lineId]: e.target.checked }))}
                aria-label={line.name}
              />
              <span className="truncate text-sm font-medium">{line.name}</span>
              <NativeSelect
                value={r.employeeId}
                onChange={(e) => update(r.lineId, { employeeId: e.target.value })}
                aria-label={`${t.assignee} – ${line.name}`}
              >
                <option value="">{t.openShifts}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={String(r.startWeek)}
                onChange={(e) => update(r.lineId, { startWeek: Number(e.target.value) })}
                aria-label={`${t.startWeek} – ${line.name}`}
                disabled={lengthWeeks === 1}
              >
                {Array.from({ length: lengthWeeks }, (_, i) => (
                  <option key={i} value={i}>
                    {t.startWeek} {i + 1}
                  </option>
                ))}
              </NativeSelect>
            </div>
          );
        })}
      </div>
      {state.errors?.assignments ? (
        <p className="text-xs font-medium text-destructive">{state.errors.assignments}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <SubmitButton variant="signal">{t.rollout}</SubmitButton>
        {state.ok ? null : <FormMessage state={state} />}
      </div>
    </form>
  );
}

export function RerollButton({ rolloutId }: { rolloutId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title={da.turnus.rerollHelp}
      onClick={() =>
        start(async () => {
          const r = await rerollAction({ rolloutId });
          if (r.ok) toast.success(r.message);
          else toast.error(r.message ?? da.common.unknownError);
        })
      }
    >
      <RotateCcw /> {da.turnus.reroll}
    </Button>
  );
}
