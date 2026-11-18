"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { History, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { BreaksEditor } from "@/components/schedule/breaks-editor";
import {
  archiveTimeEntryAction,
  correctTimeEntryAction,
  saveTimeEntryAction,
  timeEntryHistoryAction,
} from "@/lib/actions/time";
import { initialActionState } from "@/lib/actions/state";
import { dbBreaksToForm, type EditableBreak } from "@/lib/domain/breaks";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import type { TimeRow } from "@/lib/time/load";
import type { SupplementOption } from "@/lib/time/supplements";
import { Checkbox } from "@/components/ui/checkbox";
import { da } from "@/lib/i18n/da";
import { PostingEditor } from "@/components/posting/posting-editor";
import {
  availablePosting,
  postingToForm,
  type EditablePostingRow,
  type PostingDimension,
} from "@/lib/domain/posting";

export type EntryDraft =
  | { mode: "edit" | "correct"; row: TimeRow }
  | { mode: "create"; employeeId: string; departmentId: string | null; date: string };

/** Supplement types offered in the dialog; `chooseAll` for managers (the database checks it). */
export type EntrySupplements = { options: SupplementOption[]; chooseAll: boolean };

export function EntryDialog({
  draft,
  posting,
  supplements,
  onClose,
}: {
  draft: EntryDraft | null;
  posting: PostingDimension[];
  supplements: EntrySupplements;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {draft ? (
          <EntryForm
            key={draft.mode === "create" ? `new-${draft.date}` : draft.row.entryId}
            draft={draft}
            posting={posting}
            supplements={supplements}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  draft,
  posting,
  supplements,
  onDone,
}: {
  draft: EntryDraft;
  posting: PostingDimension[];
  supplements: EntrySupplements;
  onDone: () => void;
}) {
  const t = da.time;
  const row = draft.mode === "create" ? null : draft.row;
  const [state, action] = useActionState(
    draft.mode === "correct" ? correctTimeEntryAction : saveTimeEntryAction,
    initialActionState,
  );
  const [removing, startRemove] = useTransition();
  const [values, setValues] = useState(() => ({
    date: row ? row.date : draft.mode === "create" ? draft.date : "",
    start_time: row ? localParts(row.start).time : "08:00",
    end_time: row?.end ? localParts(row.end).time : "16:00",
    deviation_reason: draft.mode === "correct" ? "" : (row?.deviationReason ?? ""),
    note: row?.note ?? "",
    kind: row?.workKind === "call_out" ? "call_out" : "work",
  }));
  const [breaks, setBreaks] = useState<EditableBreak[]>(() =>
    row ? dbBreaksToForm(row.breaks) : [{ start: "", minutes: 30, paid: false }],
  );
  const [postingRows, setPostingRows] = useState<EditablePostingRow[]>(() =>
    row ? postingToForm(row.postingAllocations) : [],
  );
  const [chosen, setChosen] = useState<string[]>(() => row?.supplementTypeIds ?? []);
  const supplementChoices = supplements.options.filter(
    (s) =>
      chosen.includes(s.id) || (!s.archived && (supplements.chooseAll || s.employeeSelectable)),
  );
  const [history, setHistory] = useState<Awaited<ReturnType<typeof timeEntryHistoryAction>> | null>(
    null,
  );
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  const departmentId = row?.departmentId ?? (draft.mode === "create" ? draft.departmentId : null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {draft.mode === "create" ? t.newEntry : draft.mode === "correct" ? t.correct : t.edit}
        </DialogTitle>
        <DialogDescription>
          {row ? `${row.employeeName} · ${row.departmentName}` : null}
          {row?.plan ? ` · ${t.planned} ${timeRange(row.plan.start, row.plan.end)}` : null}
          {row && !row.plan ? ` · ${t.noPlan}` : null}
        </DialogDescription>
      </DialogHeader>
      <form action={action} className="grid gap-4" noValidate data-testid="entry-form">
        <FormMessage state={state} />
        {row?.entryId ? <input type="hidden" name="id" value={row.entryId} /> : null}
        {draft.mode === "create" ? (
          <>
            <input type="hidden" name="employee_id" value={draft.employeeId} />
            <input type="hidden" name="department_id" value={draft.departmentId ?? ""} />
          </>
        ) : null}
        {draft.mode === "correct" ? null : (
          <Field label={t.kind} htmlFor="kind">
            <NativeSelect id="kind" name="kind" value={values.kind} onChange={set("kind")}>
              <option value="work">{t.kinds.work}</option>
              <option value="call_out">{t.kinds.call_out}</option>
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={da.schedule.date} htmlFor="date" error={state.errors?.date}>
            <Input id="date" name="date" type="date" value={values.date} onChange={set("date")} />
          </Field>
          <Field label={da.schedule.start} htmlFor="start_time" error={state.errors?.start_time}>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              step={60}
              value={values.start_time}
              onChange={set("start_time")}
            />
          </Field>
          <Field label={da.schedule.end} htmlFor="end_time" error={state.errors?.end_time}>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              step={60}
              value={values.end_time}
              onChange={set("end_time")}
            />
          </Field>
        </div>
        <BreaksEditor value={breaks} onChange={setBreaks} error={state.errors?.breaks} />
        <PostingEditor
          dimensions={availablePosting(posting, departmentId)}
          value={postingRows}
          onChange={setPostingRows}
          error={
            Object.entries(state.errors ?? {}).find(([k]) =>
              k.startsWith("posting_allocations"),
            )?.[1]
          }
        />
        <input type="hidden" name="supplement_type_ids" value={JSON.stringify(chosen)} />
        {supplementChoices.length > 0 ? (
          <fieldset className="grid gap-2" data-testid="entry-supplements">
            <legend className="mb-1 text-sm font-medium">{t.supplements}</legend>
            <p className="text-xs text-muted-foreground">{t.supplementsHelp}</p>
            {supplementChoices.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.name}
                <span className="font-mono text-xs text-muted-foreground">{s.payCode}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field
          label={draft.mode === "correct" ? t.correctionReason : t.reason}
          htmlFor="deviation_reason"
          error={state.errors?.deviation_reason}
        >
          <Input
            id="deviation_reason"
            name="deviation_reason"
            value={values.deviation_reason}
            onChange={set("deviation_reason")}
          />
        </Field>
        {draft.mode === "correct" ? null : (
          <Field label={`${t.note} (${da.common.optional})`} htmlFor="note">
            <Textarea id="note" name="note" rows={2} value={values.note} onChange={set("note")} />
          </Field>
        )}

        {history ? (
          <ol className="grid gap-2 rounded-lg border p-3 text-sm" data-testid="entry-history">
            {history.map((h, i) => (
              <li key={h.id} className="grid gap-0.5">
                <span className="font-medium">
                  {t.version(history.length - i)} · {h.superseded_at ? t.superseded : t.current} ·{" "}
                  {t.statuses[h.status]}
                </span>
                <span className="text-muted-foreground tabular">
                  {h.end_at ? timeRange(h.start_at, h.end_at) : localParts(h.start_at).time} ·{" "}
                  {t.sources[h.source]} {h.created_by_email ? `${t.by} ${h.created_by_email}` : ""}
                  {h.created_as_email ? ` ${da.impersonation.historyAs(h.created_as_email)}` : ""}
                  {h.approved_by_email
                    ? ` · ${t.statuses.approved} ${t.by} ${h.approved_by_email}`
                    : ""}
                  {h.approved_as_email ? ` ${da.impersonation.historyAs(h.approved_as_email)}` : ""}
                </span>
                {h.deviation_reason ? <span>“{h.deviation_reason}”</span> : null}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {row?.entryId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => setHistory(await timeEntryHistoryAction(row.entryId!))}
              >
                <History /> {t.history}
              </Button>
            ) : null}
            {row?.entryId && draft.mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    await archiveTimeEntryAction(row.entryId!);
                    onDone();
                  })
                }
              >
                <Trash2 /> {t.remove}
              </Button>
            ) : null}
          </div>
          <SubmitButton>{t.save}</SubmitButton>
        </div>
      </form>
    </>
  );
}
