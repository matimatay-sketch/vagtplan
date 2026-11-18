"use client";
import { Field } from "@/components/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { NormDefaults, ShiftKind } from "@/lib/domain/norm-percent";
import { da } from "@/lib/i18n/da";

/**
 * Norm percent of a shift or template: the share counting towards the hours
 * norm, and whether pay uses it for overtime. Empty = the default for the kind.
 */
export function NormFields({
  kind,
  defaults,
  percent,
  inPay,
  onPercent,
  onInPay,
  error,
}: {
  kind: ShiftKind;
  defaults: NormDefaults | null;
  percent: string;
  inPay: string;
  onPercent: (v: string) => void;
  onInPay: (v: string) => void;
  error?: string;
}) {
  const t = da.schedule;
  return (
    <>
      <Field label={t.normPercent} htmlFor="norm_percent" error={error}>
        <Input
          id="norm_percent"
          name="norm_percent"
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          step={1}
          value={percent}
          placeholder={defaults ? t.normPercentDefault(defaults.percent[kind]) : ""}
          onChange={(e) => onPercent(e.target.value)}
        />
      </Field>
      <Field label={t.normInPay} htmlFor="norm_in_pay">
        <NativeSelect
          id="norm_in_pay"
          name="norm_in_pay"
          value={inPay}
          onChange={(e) => onInPay(e.target.value)}
        >
          <option value="">{t.normInPayDefault(defaults ? defaults.inPay[kind] : null)}</option>
          <option value="true">{t.yes}</option>
          <option value="false">{t.no}</option>
        </NativeSelect>
      </Field>
    </>
  );
}
