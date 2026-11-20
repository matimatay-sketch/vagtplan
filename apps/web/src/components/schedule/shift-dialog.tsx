"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2, ChevronDown } from "lucide-react";
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
import { NormFields } from "./norm-fields";
import type { NormDefaults } from "@/lib/domain/norm-percent";
import { copyShiftToDatesAction, removeShiftAction, saveShiftAction } from "@/lib/actions/schedule";
import { copyDates } from "@/lib/domain/schedule-copy";
import { weekDates, weekStartOf } from "@/lib/domain/schedule-time";
import { toast } from "sonner";
import { initialActionState } from "@/lib/actions/state";
import { localParts } from "@/lib/domain/schedule-time";
import { dbBreaksToForm, templateBreaksToForm, type EditableBreak } from "@/lib/domain/breaks";
import type {
  BoardEmployee,
  BoardShift,
  BoardSupplementType,
  BoardTemplate,
} from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";
import { BreaksEditor, SupplementPicker } from "./breaks-editor";
import { PostingEditor } from "@/components/posting/posting-editor";
import {
  defaultPostingRows,
  postingToForm,
  type EditablePostingRow,
  type PostingDimension,
} from "@/lib/domain/posting";

export type ShiftDraft = { shift?: BoardShift; employeeId: string | null; date: string };

type Props = {
  departmentId: string;
  employees: BoardEmployee[];
  templates: BoardTemplate[];
  supplementTypes: BoardSupplementType[];
  posting: PostingDimension[];
  normDefaults: NormDefaults;
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
  posting,
  normDefaults,
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
    norm_percent: String(s ? (s.normPercent ?? "") : (first?.normPercent ?? "")),
    norm_in_pay: String(s ? (s.normInPay ?? "") : (first?.normInPay ?? "")),
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
  const [postingRows, setPostingRows] = useState<EditablePostingRow[]>(() =>
    s ? postingToForm(s.postingAllocations) : defaultPostingRows(first?.postingValues),
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
      norm_percent: String(tpl.normPercent ?? ""),
      norm_in_pay: String(tpl.normInPay ?? ""),
    }));
    setBreaks(templateBreaksToForm(tpl.breaks));
    setSupplements(tpl.supplementTypeIds);
    if (Object.keys(tpl.postingValues).length)
      setPostingRows(defaultPostingRows(tpl.postingValues));
  };
  const err = (k: string) => state.errors?.[k];
  // Settings in use behind "Flere indstillinger" (counted so the fold shows they are there).
  const advancedCount =
    (values.label ? 1 : 0) +
    (values.norm_percent ? 1 : 0) +
    (values.norm_in_pay ? 1 : 0) +
    (supplements.length ? 1 : 0) +
    (postingRows.length ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(advancedCount > 0);
  const advancedError = Object.keys(state.errors ?? {}).some(
    (k) => k === "label" || k === "norm_percent" || k.startsWith("posting_allocations"),
  );

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
        </div>
        <BreaksEditor value={breaks} onChange={setBreaks} error={err("breaks")} />
        {/* The rarely used settings fold away; they open by themselves when in use. */}
        <details
          className="group/more rounded-lg border px-3 py-2"
          open={moreOpen || advancedError}
          onToggle={(e) => setMoreOpen(e.currentTarget.open)}
          data-testid="shift-more"
        >
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-medium pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open/more:rotate-180" />
            {t.moreSettings}
            {advancedCount > 0 ? (
              <span className="text-muted-foreground">{t.moreSettingsUsed(advancedCount)}</span>
            ) : null}
          </summary>
          <div className="grid gap-4 pt-3 pb-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`${t.label} (${da.common.optional})`}
                htmlFor="label"
                error={err("label")}
              >
                <Input
                  id="label"
                  name="label"
                  placeholder={t.labelPlaceholder}
                  value={values.label}
                  onChange={set("label")}
                />
              </Field>
              <NormFields
                kind={values.kind as "work" | "on_call"}
                defaults={normDefaults}
                percent={values.norm_percent}
                inPay={values.norm_in_pay}
                onPercent={(v) => setValues((x) => ({ ...x, norm_percent: v }))}
                onInPay={(v) => setValues((x) => ({ ...x, norm_in_pay: v }))}
                error={err("norm_percent")}
              />
            </div>
            <SupplementPicker
              options={supplementTypes}
              value={supplements}
              onChange={setSupplements}
            />
            <PostingEditor
              dimensions={posting}
              value={postingRows}
              onChange={setPostingRows}
              error={
                Object.entries(state.errors ?? {}).find(([k]) =>
                  k.startsWith("posting_allocations"),
                )?.[1]
              }
            />
          </div>
        </details>
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
        {s && !s.removed ? (
          <CopyShift shiftId={s.id} date={localParts(s.start).date} onDone={onDone} />
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

const weekdayShort = new Intl.DateTimeFormat("da-DK", { weekday: "short", timeZone: "UTC" });

/** Copy an existing shift to other days of its week, repeated for N weeks. */
function CopyShift({
  shiftId,
  date,
  onDone,
}: {
  shiftId: string;
  date: string;
  onDone: () => void;
}) {
  const t = da.schedule;
  const [days, setDays] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(1);
  const [pending, start] = useTransition();
  const dates = copyDates(date, days, weeks);
  return (
    <details className="rounded-lg border p-3" data-testid="copy-shift">
      <summary className="cursor-pointer text-sm font-medium">{t.copyShift}</summary>
      <div className="mt-3 grid gap-3">
        <p className="text-xs text-muted-foreground">{t.copyShiftLead}</p>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-sm">{t.copyDays}</legend>
          {weekDates(weekStartOf(date)).map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm capitalize">
              <input
                type="checkbox"
                className="accent-primary"
                disabled={d === date}
                checked={days.includes(d)}
                onChange={(e) =>
                  setDays((x) => (e.target.checked ? [...x, d] : x.filter((y) => y !== d)))
                }
              />
              {weekdayShort.format(new Date(`${d}T00:00:00Z`)).replace(".", "")}{" "}
              {Number(d.slice(8))}.
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.copyRepeat} htmlFor="copy-repeat">
            <NativeSelect
              id="copy-repeat"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                <option key={n} value={n}>
                  {t.copyRepeatWeeks(n)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={pending || dates.length === 0}
            onClick={() =>
              start(async () => {
                const r = await copyShiftToDatesAction({ id: shiftId, dates });
                if (r.ok) {
                  toast.success(r.message);
                  onDone();
                } else toast.error(r.message);
              })
            }
          >
            {t.copyDo} ({dates.length})
          </Button>
        </div>
      </div>
    </details>
  );
}
