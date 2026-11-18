"use client";
import * as React from "react";
import { useActionState, useEffect, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import {
  BreaksEditor,
  SupplementPicker,
  type SupplementOption,
} from "@/components/schedule/breaks-editor";
import { removeSlotAction, saveSlotAction } from "@/lib/actions/rotation";
import { initialActionState } from "@/lib/actions/state";
import { templateBreaksToForm, type EditableBreak } from "@/lib/domain/breaks";
import type { RotationSlot } from "@/lib/domain/rotation";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";
import type { PostingDimension } from "@/lib/domain/posting";
import { PostingValuesSelect } from "@/components/posting/posting-values";

type Line = { id: string; name: string };
type Draft = { slot?: RotationSlot; lineId: string; weekday: number };
type ShiftTemplate = {
  id: string;
  name: string;
  start: string;
  end: string;
  label: string | null;
  kind: "work" | "on_call";
  breaks: { start_time: string | null; minutes: number; paid: boolean }[];
  supplementTypeIds: string[];
  postingValues: Record<string, string>;
};

export function RotationGrid({
  rotationId,
  weekIndex,
  lines,
  slots,
  supplementTypes,
  shiftTemplates,
  posting,
}: {
  rotationId: string;
  weekIndex: number;
  lines: Line[];
  slots: RotationSlot[];
  supplementTypes: SupplementOption[];
  shiftTemplates: ShiftTemplate[];
  posting: PostingDimension[];
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const t = da.turnus;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm" data-testid="rotation-grid">
          <thead>
            <tr className="border-b">
              <th className="w-44 px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                {t.line}
              </th>
              {t.weekdays.map((d) => (
                <th
                  key={d}
                  className="border-l px-2 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0" data-line={line.name}>
                <th scope="row" className="px-3 py-2 text-left align-top font-medium">
                  {line.name}
                </th>
                {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
                  <td
                    key={weekday}
                    className="group/cell border-l p-1.5 align-top"
                    data-weekday={weekday}
                  >
                    <div className="flex min-h-12 flex-col gap-1">
                      {slots
                        .filter((s) => s.lineId === line.id && s.weekday === weekday)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            data-testid="rotation-slot"
                            onClick={() => setDraft({ slot: s, lineId: line.id, weekday })}
                            className={cn(
                              "rounded-md border px-2 py-1 text-left text-xs",
                              s.kind === "on_call"
                                ? "border-primary/30 bg-secondary"
                                : "border-primary/20 bg-primary/10",
                            )}
                          >
                            <span className="block font-semibold tabular">
                              {s.startTime}–{s.endTime}
                            </span>
                            <span className="block truncate text-muted-foreground">
                              {s.label ?? ""}
                              {s.supplementTypeIds.length ? ` +${s.supplementTypeIds.length}` : ""}
                            </span>
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => setDraft({ lineId: line.id, weekday })}
                        aria-label={`${t.newSlot} – ${line.name} ${t.weekdays[weekday - 1]}`}
                        className="mt-auto flex h-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-muted focus-visible:opacity-100"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-xl">
          {draft ? (
            <SlotForm
              key={draft.slot?.id ?? `${draft.lineId}-${draft.weekday}`}
              draft={draft}
              rotationId={rotationId}
              weekIndex={weekIndex}
              lines={lines}
              supplementTypes={supplementTypes}
              posting={posting}
              shiftTemplates={shiftTemplates}
              onDone={() => setDraft(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SlotForm({
  draft,
  rotationId,
  weekIndex,
  lines,
  supplementTypes,
  shiftTemplates,
  posting,
  onDone,
}: {
  draft: Draft;
  rotationId: string;
  weekIndex: number;
  lines: Line[];
  supplementTypes: SupplementOption[];
  shiftTemplates: ShiftTemplate[];
  posting: PostingDimension[];
  onDone: () => void;
}) {
  const t = da.turnus;
  const ts = da.schedule;
  const [state, action] = useActionState(saveSlotAction, initialActionState);
  const [removing, startRemove] = useTransition();
  const s = draft.slot;
  const [values, setValues] = React.useState({
    line_id: draft.lineId,
    weekday: String(draft.weekday),
    start_time: s?.startTime ?? "08:00",
    end_time: s?.endTime ?? "16:00",
    label: s?.label ?? "",
    kind: s?.kind ?? "work",
  });
  const [breaks, setBreaks] = React.useState<EditableBreak[]>(() =>
    s ? templateBreaksToForm(s.breaks) : [{ start: "", minutes: 30, paid: false }],
  );
  const [supplements, setSupplements] = React.useState<string[]>(s?.supplementTypeIds ?? []);
  const [postingValues, setPostingValues] = React.useState<Record<string, string>>(
    () => s?.postingValues ?? {},
  );
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const applyTemplate = (id: string) => {
    const tpl = shiftTemplates.find((x) => x.id === id);
    if (!tpl) return;
    setValues((v) => ({
      ...v,
      start_time: tpl.start,
      end_time: tpl.end,
      label: tpl.label ?? "",
      kind: tpl.kind,
    }));
    if (Object.keys(tpl.postingValues).length) setPostingValues(tpl.postingValues);
    setBreaks(templateBreaksToForm(tpl.breaks));
    setSupplements(tpl.supplementTypeIds);
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {s ? t.editSlot : t.newSlot} · {t.week(weekIndex + 1)}
        </DialogTitle>
      </DialogHeader>
      <form action={action} className="grid gap-4" noValidate data-testid="slot-form">
        <FormMessage state={state} />
        {s ? <input type="hidden" name="id" value={s.id} /> : null}
        <input type="hidden" name="rotation_id" value={rotationId} />
        <input type="hidden" name="week_index" value={weekIndex} />
        {shiftTemplates.length ? (
          <Field label={ts.template} htmlFor="slot_template">
            <NativeSelect
              id="slot_template"
              defaultValue=""
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">{ts.noTemplate}</option>
              {shiftTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.start}–{tpl.end})
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.line} htmlFor="line_id">
            <NativeSelect
              id="line_id"
              name="line_id"
              value={values.line_id}
              onChange={set("line_id")}
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={ts.date} htmlFor="weekday">
            <NativeSelect
              id="weekday"
              name="weekday"
              value={values.weekday}
              onChange={set("weekday")}
            >
              {t.weekdays.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={ts.start} htmlFor="start_time" error={state.errors?.start_time}>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              step={900}
              value={values.start_time}
              onChange={set("start_time")}
            />
          </Field>
          <Field label={ts.end} htmlFor="end_time" error={state.errors?.end_time}>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              step={900}
              value={values.end_time}
              onChange={set("end_time")}
            />
          </Field>
          <Field label={ts.kind} htmlFor="kind">
            <NativeSelect id="kind" name="kind" value={values.kind} onChange={set("kind")}>
              <option value="work">{ts.kinds.work}</option>
              <option value="on_call">{ts.kinds.on_call}</option>
            </NativeSelect>
          </Field>
          <Field label={`${ts.label} (${da.common.optional})`} htmlFor="label">
            <Input
              id="label"
              name="label"
              placeholder={ts.labelPlaceholder}
              value={values.label}
              onChange={set("label")}
            />
          </Field>
          <PostingValuesSelect
            dimensions={posting}
            value={postingValues}
            onChange={setPostingValues}
            name="posting_values"
          />
        </div>
        <BreaksEditor value={breaks} onChange={setBreaks} error={state.errors?.breaks} />
        <SupplementPicker options={supplementTypes} value={supplements} onChange={setSupplements} />
        <div className="flex items-center justify-between gap-2">
          {s ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  await removeSlotAction({ id: s.id, rotationId });
                  onDone();
                })
              }
            >
              <Trash2 /> {t.removeSlot}
            </Button>
          ) : (
            <span />
          )}
          <SubmitButton>{t.saveSlot}</SubmitButton>
        </div>
      </form>
    </>
  );
}
