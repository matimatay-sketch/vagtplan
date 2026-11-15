"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import {
  CONDITION_TYPES,
  defaultCondition,
  type ConditionType,
  type RemarkCondition,
  type RemarkParams,
} from "@/lib/domain/remarks";
import { hoursToMinutes, parseDanishDecimal } from "@/lib/domain/numbers";
import { decimalHours } from "@/lib/domain/project-report";
import { da } from "@/lib/i18n/da";

const t = da.agreements.remarks;

/** Hours typed in Danish decimals, stored as minutes. Keeps the text while typing. */
function HoursField({
  id,
  label,
  minutes,
  onChange,
}: {
  id: string;
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const [text, setText] = useState(() => decimalHours(minutes));
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const h = parseDanishDecimal(e.target.value);
          if (h !== null && h >= 0) onChange(hoursToMinutes(h));
        }}
      />
    </Field>
  );
}

function IntField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
      />
    </Field>
  );
}

export function ConditionSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ConditionType;
  onChange: (type: ConditionType) => void;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as ConditionType)}>
      {CONDITION_TYPES.map((c) => (
        <option key={c} value={c}>
          {t.conditions[c]}
        </option>
      ))}
    </NativeSelect>
  );
}

function LimitFields({
  path,
  c,
  onChange,
}: {
  path: string;
  c: RemarkCondition;
  onChange: (c: RemarkCondition) => void;
}) {
  const id = `${path}-limit`;
  switch (c.type) {
    case "shift_longer_than":
    case "shift_shorter_than":
      return (
        <div className="grid gap-1">
          <HoursField
            id={id}
            label={t.hours}
            minutes={c.minutes}
            onChange={(m) => onChange({ ...c, minutes: m })}
          />
          <p className="text-xs text-muted-foreground">{t.lengthHelp}</p>
        </div>
      );
    case "starts_before":
    case "ends_after":
      return (
        <Field label={t.time} htmlFor={id}>
          <Input
            id={id}
            type="time"
            value={c.time}
            onChange={(e) => onChange({ ...c, time: e.target.value })}
          />
        </Field>
      );
    case "consecutive_days":
      return (
        <IntField
          id={id}
          label={t.days}
          value={c.max_days}
          onChange={(n) => onChange({ ...c, max_days: Math.max(1, n) })}
        />
      );
    case "weekly_hours":
      return (
        <div className="grid gap-1">
          <HoursField
            id={id}
            label={t.hours}
            minutes={c.max_minutes}
            onChange={(m) => onChange({ ...c, max_minutes: m })}
          />
          <p className="text-xs text-muted-foreground">{t.weeklyHelp}</p>
        </div>
      );
    case "break_below":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <HoursField
            id={id}
            label={t.shiftOver}
            minutes={c.shift_over_minutes}
            onChange={(m) => onChange({ ...c, shift_over_minutes: m })}
          />
          <IntField
            id={`${path}-break`}
            label={t.minBreak}
            value={c.min_break_minutes}
            onChange={(n) => onChange({ ...c, min_break_minutes: n })}
          />
        </div>
      );
    case "rest_below":
      return (
        <HoursField
          id={id}
          label={t.hours}
          minutes={c.min_minutes}
          onChange={(m) => onChange({ ...c, min_minutes: m })}
        />
      );
  }
}

/** The parameters of a remark rule as a form (severity and name are edited with the rule). */
export function RemarkFields({
  path,
  value,
  onChange,
}: {
  path: string;
  value: RemarkParams;
  onChange: (p: RemarkParams) => void;
}) {
  const showIn = value.show_in ?? ["schedule", "time"];
  const toggle = (k: "schedule" | "time", on: boolean) =>
    onChange({
      ...value,
      show_in: on ? [...new Set([...showIn, k])] : showIn.filter((x) => x !== k),
    });
  return (
    <div className="grid gap-3" data-testid="remark-fields">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label={t.message} htmlFor={`${path}-message`}>
          <Input
            id={`${path}-message`}
            value={value.message}
            onChange={(e) => onChange({ ...value, message: e.target.value })}
          />
        </Field>
        <Field label={t.code} htmlFor={`${path}-code`}>
          <Input
            id={`${path}-code`}
            className="font-mono"
            value={value.code}
            onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase() })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.condition} htmlFor={`${path}-condition`}>
          <ConditionSelect
            id={`${path}-condition`}
            value={value.condition.type}
            onChange={(type) => onChange({ ...value, condition: defaultCondition(type) })}
          />
        </Field>
        <LimitFields
          key={value.condition.type}
          path={path}
          c={value.condition}
          onChange={(condition) => onChange({ ...value, condition })}
        />
      </div>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1 text-sm font-medium">{t.showIn}</legend>
        {(["schedule", "time"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary"
              checked={showIn.includes(k)}
              onChange={(e) => toggle(k, e.target.checked)}
            />
            {k === "schedule" ? t.showInSchedule : t.showInTime}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
