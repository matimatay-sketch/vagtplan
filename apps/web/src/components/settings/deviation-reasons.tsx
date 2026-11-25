"use client";
import { ScopeFields, type ScopeOptions } from "@/components/settings/scope-fields";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  archiveDeviationReasonAction,
  saveDeviationReasonAction,
  saveDeviationThresholdAction,
} from "@/lib/actions/settings";
import { initialActionState } from "@/lib/actions/state";
import { SITUATIONS, type DeviationReason } from "@/lib/domain/deviation";
import { da } from "@/lib/i18n/da";

const t = da.deviationReasons;
const choice = "flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11";

export function DeviationThresholdForm({ minutes }: { minutes: number }) {
  const [state, action] = useActionState(saveDeviationThresholdAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <Field
        label={t.threshold}
        htmlFor="deviation_threshold_minutes"
        error={state.errors?.deviation_threshold_minutes}
        help={t.thresholdHelp}
      >
        <Input
          type="number"
          min={0}
          max={240}
          className="w-28"
          {...fieldProps("deviation_threshold_minutes", state, String(minutes))}
        />
      </Field>
      <SubmitButton variant="outline">{t.saveThreshold}</SubmitButton>
      {state.ok ? <span className="text-sm text-muted-foreground">{da.common.saved}</span> : null}
    </form>
  );
}

/** A reason: name, situations, what it does to the pay. Edit forms prefix ids with the reason id. */
export function DeviationReasonForm({
  initial,
  absenceTypes,
  scope,
}: {
  initial?: DeviationReason & {
    department_ids?: string[];
    agreement_ids?: string[];
    employee_group_ids?: string[];
  };
  absenceTypes: { code: string; label: string }[];
  scope?: ScopeOptions;
}) {
  const [state, action] = useActionState(saveDeviationReasonAction, initialActionState);
  const router = useRouter();
  const p = initial ? `${initial.id}-` : "new-reason-";
  const [treatment, setTreatment] = useState(initial?.treatment ?? "none");
  const [mode, setMode] = useState(initial?.time_off_mode ?? "agreement");
  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  const err = (k: string) => state.errors?.[k];
  return (
    <form action={action} className="grid gap-4" noValidate data-testid="deviation-reason-form">
      <FormMessage state={state.ok ? {} : state} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} htmlFor={`${p}name`} error={err("name")}>
          <Input
            id={`${p}name`}
            name="name"
            placeholder={t.namePlaceholder}
            defaultValue={state.values?.name ?? initial?.name}
          />
        </Field>
        <Field label={t.treatment} htmlFor={`${p}treatment`} error={err("treatment")}>
          <NativeSelect
            id={`${p}treatment`}
            name="treatment"
            value={treatment}
            onChange={(e) => setTreatment(e.target.value as DeviationReason["treatment"])}
          >
            {(["none", "payout", "time_off", "absence"] as const).map((k) => (
              <option key={k} value={k}>
                {t.treatments[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">{t.appliesTo}</legend>
        <div className="flex flex-wrap gap-x-4">
          {SITUATIONS.map((s) => (
            <label key={s} className={choice}>
              <input
                type="checkbox"
                className="size-4 accent-primary"
                name="applies_to"
                value={s}
                defaultChecked={initial?.applies_to.includes(s)}
              />
              {t.situations[s]}
            </label>
          ))}
        </div>
        {err("applies_to") ? (
          <p className="text-xs font-medium text-destructive">{err("applies_to")}</p>
        ) : null}
      </fieldset>
      {treatment === "time_off" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.timeOffMode} htmlFor={`${p}time_off_mode`}>
            <NativeSelect
              id={`${p}time_off_mode`}
              name="time_off_mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as DeviationReason["time_off_mode"])}
            >
              <option value="agreement">{t.timeOffModes.agreement}</option>
              <option value="factor">{t.timeOffModes.factor}</option>
            </NativeSelect>
          </Field>
          {mode === "factor" ? (
            <>
              <Field
                label={t.factor}
                htmlFor={`${p}time_off_factor`}
                error={err("time_off_factor")}
              >
                <Input
                  id={`${p}time_off_factor`}
                  name="time_off_factor"
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={
                    state.values?.time_off_factor ??
                    String((initial?.time_off_factor_bp ?? 10000) / 10000).replace(".", ",")
                  }
                />
              </Field>
              <Field
                label={t.payCode}
                htmlFor={`${p}time_off_pay_code`}
                error={err("time_off_pay_code")}
              >
                <Input
                  id={`${p}time_off_pay_code`}
                  name="time_off_pay_code"
                  className="font-mono"
                  defaultValue={state.values?.time_off_pay_code ?? initial?.time_off_pay_code ?? ""}
                />
              </Field>
            </>
          ) : null}
        </div>
      ) : null}
      {treatment === "absence" ? (
        <Field label={t.absenceType} htmlFor={`${p}absence_type`} error={err("absence_type")}>
          <NativeSelect
            id={`${p}absence_type`}
            name="absence_type"
            defaultValue={state.values?.absence_type ?? initial?.absence_type ?? ""}
          >
            <option value="">–</option>
            {absenceTypes.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {scope ? <ScopeFields prefix={p} options={scope} initial={initial} /> : null}
      <div>
        <SubmitButton>{initial ? t.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

export function ArchiveDeviationReasonButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      aria-label={`${t.archive} ${name}`}
      onClick={() => {
        if (!window.confirm(t.archiveConfirm)) return;
        start(async () => {
          const r = await archiveDeviationReasonAction(id);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          router.refresh();
        });
      }}
    >
      <Trash2 /> {t.archive}
    </Button>
  );
}
