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
import { dbBreaksToForm, templateBreaksToForm, type EditableBreak } from "@/lib/domain/breaks";
import type {
  BoardEmployee,
  BoardProject,
  BoardShift,
  BoardSupplementType,
  BoardTemplate,
} from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";
import {
  allocationsToForm,
  defaultProjectRows,
  type EditableProjectRow,
} from "@/lib/domain/projects";
import { BreaksEditor, SupplementPicker } from "./breaks-editor";
import { ProjectsEditor } from "./projects-editor";

export type ShiftDraft = { shift?: BoardShift; employeeId: string | null; date: string };

type Props = {
  departmentId: string;
  employees: BoardEmployee[];
  templates: BoardTemplate[];
  supplementTypes: BoardSupplementType[];
  projects: BoardProject[];
};

export function ShiftDialog({
  draft,
  onClose,
  ...props
}: Props & { draft: ShiftDraft | null; onClose: () => void }) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {draft ? (
          <ShiftForm
            key={draft.shift?.id ?? `${draft.employeeId}-${draft.date}`}
            draft={draft}
            onDone={onClose}
            {...props}
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
  supplementTypes,
  projects,
}: Props & { draft: ShiftDraft; onDone: () => void }) {
  const t = da.schedule;
  const [state, action] = useActionState(saveShiftAction, initialActionState);
  const [removing, startRemove] = useTransition();
  const s = draft.shift;
  const first = s ? undefined : templates[0];
  const [values, setValues] = useState(() => ({
    employee_id: s ? (s.employeeId ?? "") : (draft.employeeId ?? ""),
    date: s ? localParts(s.start).date : draft.date,
    start_time: s ? localParts(s.start).time : (first?.start ?? "08:00"),
    end_time: s ? localParts(s.end).time : (first?.end ?? "16:00"),
    label: s?.label ?? first?.label ?? "",
    kind: s?.kind ?? first?.kind ?? "work",
    template_id: s?.templateId ?? first?.id ?? "",
  }));
  const [breaks, setBreaks] = useState<EditableBreak[]>(() =>
    s
      ? dbBreaksToForm(s.breaks)
      : first
        ? templateBreaksToForm(first.breaks)
        : [{ start: "", minutes: 30, paid: false }],
  );
  const [supplements, setSupplements] = useState<string[]>(
    () => s?.supplementTypeIds ?? first?.supplementTypeIds ?? [],
  );
  const [projectRows, setProjectRows] = useState<EditableProjectRow[]>(() =>
    s
      ? allocationsToForm(s.projectAllocations)
      : defaultProjectRows(
          projects.some((p) => p.id === first?.projectId) ? first?.projectId : null,
        ),
  );
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) {
      setValues((v) => ({ ...v, template_id: "" }));
      return;
    }
    setValues((v) => ({
      ...v,
      template_id: id,
      start_time: tpl.start,
      end_time: tpl.end,
      label: tpl.label ?? "",
      kind: tpl.kind,
    }));
    setBreaks(templateBreaksToForm(tpl.breaks));
    setSupplements(tpl.supplementTypeIds);
    if (tpl.projectId && projects.some((p) => p.id === tpl.projectId))
      setProjectRows(defaultProjectRows(tpl.projectId));
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
          <Field label={t.kind} htmlFor="kind">
            <NativeSelect id="kind" name="kind" value={values.kind} onChange={set("kind")}>
              <option value="work">{t.kinds.work}</option>
              <option value="on_call">{t.kinds.on_call}</option>
            </NativeSelect>
          </Field>
          <Field label={`${t.label} (${da.common.optional})`} htmlFor="label" error={err("label")}>
            <Input
              id="label"
              name="label"
              placeholder={t.labelPlaceholder}
              value={values.label}
              onChange={set("label")}
            />
          </Field>
        </div>
        <BreaksEditor value={breaks} onChange={setBreaks} error={err("breaks")} />
        <SupplementPicker options={supplementTypes} value={supplements} onChange={setSupplements} />
        <ProjectsEditor
          projects={projects}
          value={projectRows}
          onChange={setProjectRows}
          error={
            Object.entries(state.errors ?? {}).find(([k]) =>
              k.startsWith("project_allocations"),
            )?.[1]
          }
        />
        {s?.violations.length ? (
          <ul className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {s.violations.map((v, i) => (
              <li
                key={i}
                className={
                  v.severity === "BLOCKING"
                    ? "text-destructive"
                    : v.severity === "INFO"
                      ? "text-muted-foreground"
                      : "text-warning-foreground"
                }
              >
                {v.severity === "BLOCKING"
                  ? t.blocking
                  : v.severity === "INFO"
                    ? t.info
                    : t.warning}
                : {v.message}
                {v.handling === "allow" && v.severity === "BLOCKING"
                  ? ` (${t.permanentlyOverridden})`
                  : ""}
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
