"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { removeShiftAction, saveShiftAction } from "@/lib/actions/schedule";
import { initialActionState } from "@/lib/actions/state";
import { localParts } from "@/lib/domain/schedule-time";
import type { BoardEmployee, BoardShift, BoardTemplate } from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";

export type ShiftDraft = { shift?: BoardShift; employeeId: string | null; date: string };

export function ShiftDialog({
  draft,
  onClose,
  departmentId,
  employees,
  templates,
}: {
  draft: ShiftDraft | null;
  onClose: () => void;
  departmentId: string;
  employees: BoardEmployee[];
  templates: BoardTemplate[];
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {draft ? (
          <ShiftForm
            key={draft.shift?.id ?? `${draft.employeeId}-${draft.date}`}
            draft={draft}
            onDone={onClose}
            departmentId={departmentId}
            employees={employees}
            templates={templates}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ShiftForm({
  draft,
  onDone,
  departmentId,
  employees,
  templates,
}: {
  draft: ShiftDraft;
  onDone: () => void;
  departmentId: string;
  employees: BoardEmployee[];
  templates: BoardTemplate[];
}) {
  const t = da.schedule;
  const [state, action] = useActionState(saveShiftAction, initialActionState);
  const [removing, startRemove] = useTransition();
  const s = draft.shift;
  const [values, setValues] = useState(() => ({
    employee_id: s ? (s.employeeId ?? "") : (draft.employeeId ?? ""),
    date: s ? localParts(s.start).date : draft.date,
    start_time: s ? localParts(s.start).time : (templates[0]?.start ?? "08:00"),
    end_time: s ? localParts(s.end).time : (templates[0]?.end ?? "16:00"),
    break_minutes: String(s ? s.breakMinutes : (templates[0]?.breakMinutes ?? 30)),
    label: s?.label ?? templates[0]?.label ?? "",
    kind: s?.kind ?? templates[0]?.kind ?? "work",
    template_id: s?.templateId ?? (s ? "" : (templates[0]?.id ?? "")),
  }));
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    setValues((v) =>
      tpl
        ? {
            ...v,
            template_id: id,
            start_time: tpl.start,
            end_time: tpl.end,
            break_minutes: String(tpl.breakMinutes),
            label: tpl.label ?? "",
            kind: tpl.kind,
          }
        : { ...v, template_id: "" },
    );
  };
  const err = (k: string) => state.errors?.[k];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{s ? t.editShift : t.newShift}</DialogTitle>
        <DialogDescription>{t.rulesNote}</DialogDescription>
      </DialogHeader>
      <form action={action} className="grid gap-4" noValidate data-testid="shift-form">
        <FormMessage state={state} />
        {s ? <input type="hidden" name="id" value={s.id} /> : null}
        <input type="hidden" name="department_id" value={departmentId} />
        {templates.length ? (
          <Field label={t.template} htmlFor="template_id">
            <NativeSelect
              id="template_id"
              name="template_id"
              value={values.template_id}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">{t.noTemplate}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.start}–{tpl.end})
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="template_id" value="" />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.employee} htmlFor="employee_id" error={err("employee_id")}>
            <NativeSelect
              id="employee_id"
              name="employee_id"
              value={values.employee_id}
              onChange={set("employee_id")}
            >
              <option value="">{t.openShift}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t.date} htmlFor="date" error={err("date")}>
            <Input id="date" name="date" type="date" value={values.date} onChange={set("date")} />
          </Field>
          <Field label={t.start} htmlFor="start_time" error={err("start_time")}>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              step={900}
              value={values.start_time}
              onChange={set("start_time")}
            />
          </Field>
          <Field label={t.end} htmlFor="end_time" error={err("end_time")}>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              step={900}
              value={values.end_time}
              onChange={set("end_time")}
            />
          </Field>
          <Field label={t.breakMinutes} htmlFor="break_minutes" error={err("break_minutes")}>
            <Input
              id="break_minutes"
              name="break_minutes"
              type="number"
              min={0}
              step={5}
              value={values.break_minutes}
              onChange={set("break_minutes")}
            />
          </Field>
          <Field label={t.kind} htmlFor="kind">
            <NativeSelect id="kind" name="kind" value={values.kind} onChange={set("kind")}>
              <option value="work">{t.kinds.work}</option>
              <option value="on_call">{t.kinds.on_call}</option>
            </NativeSelect>
          </Field>
          <Field
            label={`${t.label} (${da.common.optional})`}
            htmlFor="label"
            error={err("label")}
            className="sm:col-span-2"
          >
            <Input
              id="label"
              name="label"
              placeholder={t.labelPlaceholder}
              value={values.label}
              onChange={set("label")}
            />
          </Field>
        </div>
        {s?.violations.length ? (
          <ul className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {s.violations.map((v, i) => (
              <li
                key={i}
                className={
                  v.severity === "BLOCKING" ? "text-destructive" : "text-warning-foreground"
                }
              >
                {v.severity === "BLOCKING" ? t.blocking : t.warning}: {v.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {s && !s.removed ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  await removeShiftAction(s.id);
                  onDone();
                })
              }
            >
              <Trash2 /> {t.remove}
            </Button>
          ) : (
            <span />
          )}
          <SubmitButton>{t.save}</SubmitButton>
        </div>
      </form>
    </>
  );
}
