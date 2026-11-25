"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Trash2, Users } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  archiveReminderAction,
  previewReminderAction,
  saveReminderAction,
  sendReminderAction,
} from "@/lib/actions/reminders";
import { initialActionState } from "@/lib/actions/state";
import { REMINDER_KINDS, type ReminderKind } from "@/lib/forms/reminders";
import { da } from "@/lib/i18n/da";
import { REMINDER_FREQUENCIES, type ReminderFrequency } from "@/lib/domain/reminder-schedule";

const t = da.reminders;

export type ReminderRuleValues = {
  id?: string;
  name: string;
  kind: ReminderKind;
  department_ids: string[];
  employee_ids: string[];
  lookback_days: number;
  note: string;
  auto: boolean;
  weekdays: number[];
  frequency: ReminderFrequency;
  day_of_month: number;
  month: number;
};

const checkbox = "size-4 accent-primary";
const choice = "flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11";

/** A reminder rule: what, for whom, how far back, own text and automatic sending. */
export function ReminderForm({
  departments,
  employees,
  initial,
  requireDepartment,
}: {
  departments: { id: string; name: string }[];
  employees: { id: string; name: string; departmentIds: string[] }[];
  initial?: ReminderRuleValues;
  /** Managers with department scope must choose their departments. */
  requireDepartment: boolean;
}) {
  const [state, action] = useActionState(saveReminderAction, initialActionState);
  const router = useRouter();
  const p = initial?.id ? `${initial.id}-` : "new-";
  const [depts, setDepts] = useState<string[]>(
    initial?.department_ids ?? (requireDepartment ? departments.map((d) => d.id) : []),
  );
  const [auto, setAuto] = useState(initial?.auto ?? false);
  const [frequency, setFrequency] = useState<ReminderFrequency>(
    (state.values?.frequency as ReminderFrequency | undefined) ?? initial?.frequency ?? "weekly",
  );
  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  const shown = employees.filter(
    (e) => depts.length === 0 || e.departmentIds.some((d) => depts.includes(d)),
  );
  const err = (k: string) => state.errors?.[k];
  return (
    <form action={action} className="grid gap-4" noValidate data-testid="reminder-form">
      <FormMessage state={state.ok ? {} : state} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} htmlFor={`${p}name`} error={err("name")}>
          <Input
            id={`${p}name`}
            name="name"
            placeholder={t.namePlaceholder}
            defaultValue={state.values?.name ?? initial?.name}
          />
        </Field>
        <Field label={t.kind} htmlFor={`${p}kind`} error={err("kind")}>
          <NativeSelect
            id={`${p}kind`}
            name="kind"
            defaultValue={state.values?.kind ?? initial?.kind ?? "missing_registration"}
          >
            {REMINDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">{t.departments}</legend>
        <div className="flex flex-wrap gap-x-4">
          {departments.map((d) => (
            <label key={d.id} className={choice}>
              <input
                type="checkbox"
                className={checkbox}
                name="department_ids"
                value={d.id}
                checked={depts.includes(d.id)}
                onChange={(e) =>
                  setDepts((x) => (e.target.checked ? [...x, d.id] : x.filter((y) => y !== d.id)))
                }
              />
              {d.name}
            </label>
          ))}
        </div>
        {!requireDepartment && depts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.allDepartments}</p>
        ) : null}
      </fieldset>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">{t.employees}</legend>
        <p className="text-xs text-muted-foreground">{t.employeesHelp}</p>
        <div
          className="grid max-h-48 gap-x-4 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2"
          tabIndex={0}
          role="region"
          aria-label={t.employees}
        >
          {shown.map((e) => (
            <label key={e.id} className={choice}>
              <input
                type="checkbox"
                className={checkbox}
                name="employee_ids"
                value={e.id}
                defaultChecked={initial?.employee_ids.includes(e.id)}
              />
              {e.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.lookback}
          htmlFor={`${p}lookback_days`}
          error={err("lookback_days")}
          help={t.lookbackHelp}
        >
          <Input
            id={`${p}lookback_days`}
            name="lookback_days"
            type="number"
            min={1}
            max={93}
            className="w-28"
            defaultValue={state.values?.lookback_days ?? String(initial?.lookback_days ?? 14)}
          />
        </Field>
        <Field label={t.note} htmlFor={`${p}note`} error={err("note")}>
          <Input id={`${p}note`} name="note" defaultValue={state.values?.note ?? initial?.note} />
        </Field>
      </div>
      <fieldset className="grid gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t.auto}</legend>
        <label className={choice}>
          <input
            type="checkbox"
            className={checkbox}
            name="auto"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          {t.auto}
        </label>
        <p className="text-xs text-muted-foreground">{t.autoHelp}</p>
        {auto ? (
          <Field label={t.frequency} htmlFor={`${p}frequency`} className="w-fit">
            <NativeSelect
              id={`${p}frequency`}
              name="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ReminderFrequency)}
            >
              {REMINDER_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {t.frequencies[f]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {auto && frequency !== "weekly" ? (
          <div className="flex flex-wrap gap-4">
            <Field
              label={t.dayOfMonth}
              htmlFor={`${p}day`}
              error={err("day_of_month")}
              help={t.dayHelp}
            >
              <Input
                id={`${p}day`}
                name="day_of_month"
                type="number"
                min={1}
                max={31}
                className="w-24"
                defaultValue={state.values?.day_of_month ?? String(initial?.day_of_month ?? 1)}
              />
            </Field>
            {frequency === "quarterly" ? (
              <Field label={t.quarterMonth} htmlFor={`${p}qmonth`} error={err("month")}>
                <NativeSelect
                  id={`${p}qmonth`}
                  name="month"
                  defaultValue={String(Math.min(initial?.month ?? 1, 3))}
                >
                  {t.quarterMonths.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : frequency === "yearly" ? (
              <Field label={t.monthOfYear} htmlFor={`${p}month`} error={err("month")}>
                <NativeSelect
                  id={`${p}month`}
                  name="month"
                  defaultValue={String(initial?.month ?? 1)}
                >
                  {t.monthNames.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
          </div>
        ) : null}
        {auto && frequency === "weekly" ? (
          <div className="flex flex-wrap gap-x-4" role="group" aria-label={t.weekdays}>
            {t.weekdayNames.map((name, i) => (
              <label key={name} className={choice}>
                <input
                  type="checkbox"
                  className={checkbox}
                  name="weekdays"
                  value={i + 1}
                  defaultChecked={(initial?.weekdays ?? [1, 2, 3, 4, 5]).includes(i + 1)}
                />
                {name}
              </label>
            ))}
          </div>
        ) : null}
        {err("weekdays") ? (
          <p className="text-xs font-medium text-destructive">{err("weekdays")}</p>
        ) : null}
      </fieldset>
      <div>
        <SubmitButton>{initial?.id ? t.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

/** Preview, send now and delete. */
export function ReminderActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recipients, setRecipients] = useState<{ name: string; items: number }[] | null>(null);
  const preview = () =>
    start(async () => {
      const r = await previewReminderAction(id);
      if (!r.ok && r.message) toast.error(r.message);
      setRecipients(r.recipients);
    });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={preview}>
          <Users /> {t.preview}
        </Button>
        <Button
          size="sm"
          disabled={pending}
          data-testid="send-reminder"
          onClick={() =>
            start(async () => {
              const r = await previewReminderAction(id);
              if (!r.ok) return void toast.error(r.message ?? da.common.unknownError);
              if (r.recipients.length === 0) return void toast.info(t.previewEmpty);
              if (!window.confirm(t.sendConfirm(r.recipients.length))) return;
              const s = await sendReminderAction(id);
              if (s.message) (s.ok ? toast.success : toast.error)(s.message);
              setRecipients(null);
              router.refresh();
            })
          }
        >
          <Send /> {t.sendNow}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t.archiveConfirm)) return;
            start(async () => {
              const r = await archiveReminderAction(id);
              if (r.message) (r.ok ? toast.success : toast.error)(r.message);
              router.refresh();
            });
          }}
        >
          <Trash2 /> {t.archive}
        </Button>
      </div>
      {recipients ? (
        <p className="text-sm" data-testid="reminder-preview">
          {recipients.length === 0
            ? t.previewEmpty
            : recipients.map((r) => t.previewCount(r.name, r.items)).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
