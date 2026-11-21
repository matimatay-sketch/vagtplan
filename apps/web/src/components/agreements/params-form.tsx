"use client";
import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate } from "@/lib/format";
import { parseDanishDecimal } from "@/lib/domain/numbers";
import {
  describeSchema,
  holidayRows,
  initialValue,
  setHoliday,
  unwrap,
  type HolidayParams,
  type Schema,
} from "@/lib/domain/schema-form";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type { Json };

const t = da.agreements;
const f = t.form;

const humanize = (key: string) => {
  const s = key.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const labelFor = (labelPath: string[]) =>
  t.fields[labelPath.join(".")] ?? t.fields[labelPath.at(-1)!] ?? humanize(labelPath.at(-1)!);
const valueLabel = (labelPath: string[], v: string) =>
  t.fieldValues[`${labelPath.join(".")}:${v}`] ?? t.fieldValues[v] ?? humanize(v);

/** Minutes are typed as hours, basis points as percent. */
function unitOf(key: string): "hours" | "percent" | null {
  if (key.endsWith("_minutes")) return "hours";
  if (key.endsWith("_bp")) return "percent";
  return null;
}

/**
 * Edits a rule's parameters with fields built from the primitive's schema:
 * numbers (minutes as hours, basis points as percent), times, dates, choices,
 * yes/no, optional groups and lists. Never JSON.
 */
export function SchemaForm({
  schema,
  value,
  onChange,
  path,
  labelPath,
  payCodes = [],
  root = false,
}: {
  schema: Schema;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Unique id prefix for the fields. */
  path: string;
  /** The primitive and the keys, for labels. */
  labelPath: string[];
  payCodes?: string[];
  /** A list item: its fields without a frame of their own. */
  root?: boolean;
}) {
  const node = describeSchema(schema);
  const { nullable } = unwrap(schema);
  const label = labelFor(labelPath);
  const key = labelPath.at(-1)!;

  if (node.kind === "object") {
    const obj = (value ?? {}) as Record<string, unknown>;
    if (nullable && value === null)
      return (
        <CheckRow
          id={path}
          label={f.use(label)}
          checked={false}
          onChange={() => onChange(initialValue(unwrap(schema).schema))}
        />
      );
    const fields = (
      <div className="grid gap-3 sm:grid-cols-2">
        {node.fields.map(([k, s]) => (
          <SchemaForm
            key={k}
            schema={s}
            value={obj[k] === undefined ? initialValue(s) : obj[k]}
            path={`${path}.${k}`}
            labelPath={[...labelPath, k]}
            payCodes={payCodes}
            onChange={(v) => onChange({ ...obj, [k]: v })}
          />
        ))}
      </div>
    );
    if (root || labelPath.length === 1) return fields;
    return (
      <fieldset className="grid gap-3 rounded-lg border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        {nullable ? (
          <CheckRow id={path} label={f.use(label)} checked onChange={() => onChange(null)} />
        ) : null}
        {fields}
      </fieldset>
    );
  }

  if (node.kind === "union") {
    const obj = (value ?? {}) as Record<string, unknown>;
    const current =
      node.options.find((o) => o.value === obj[node.discriminator]) ?? node.options[0]!;
    const inner = describeSchema(current.schema);
    const rest =
      inner.kind === "object" ? inner.fields.filter(([k]) => k !== node.discriminator) : [];
    return (
      <fieldset className="grid gap-3 rounded-lg border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled
            id={`${path}.${node.discriminator}`}
            label={labelFor([...labelPath, node.discriminator])}
          >
            <NativeSelect
              id={`${path}.${node.discriminator}`}
              value={current.value}
              onChange={(e) => {
                const opt = node.options.find((o) => o.value === e.target.value)!;
                onChange(initialValue(opt.schema));
              }}
            >
              {node.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {valueLabel([...labelPath, node.discriminator], o.value)}
                </option>
              ))}
            </NativeSelect>
          </Labelled>
          {rest.map(([k, s]) => (
            <SchemaForm
              key={k}
              schema={s}
              value={obj[k] === undefined ? initialValue(s) : obj[k]}
              path={`${path}.${k}`}
              labelPath={[...labelPath, k]}
              payCodes={payCodes}
              onChange={(v) => onChange({ ...obj, [k]: v })}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (node.kind === "array") {
    const list = Array.isArray(value) ? value : [];
    const el = describeSchema(node.element);
    if (el.kind === "enum")
      return (
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {el.values.map((v) => (
              <CheckRow
                key={v}
                id={`${path}.${v}`}
                label={valueLabel(labelPath, v)}
                checked={list.includes(v)}
                onChange={(on) => onChange(on ? [...list, v] : list.filter((x) => x !== v))}
              />
            ))}
          </div>
        </fieldset>
      );
    if (el.kind !== "object")
      return (
        <Labelled id={path} label={label} hint={f.commaList}>
          <TextField
            id={path}
            value={list.join(", ")}
            onChange={(s) =>
              onChange(
                s
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </Labelled>
      );
    return (
      <div className="grid gap-3 sm:col-span-2">
        {list.map((item, i) => (
          <fieldset key={i} className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              {label} · {f.item(i + 1)}
            </legend>
            <SchemaForm
              schema={node.element}
              value={item}
              path={`${path}.${i}`}
              labelPath={labelPath}
              payCodes={payCodes}
              onChange={(v) => onChange(list.map((x, k) => (k === i ? v : x)))}
              root
            />
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onChange(list.filter((_, k) => k !== i))}
              >
                <Trash2 /> {f.remove(`${label} ${i + 1}`)}
              </Button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...list, initialValue(node.element)])}
          >
            <Plus /> {f.add(label)}
          </Button>
        </div>
      </div>
    );
  }

  if (node.kind === "enum")
    return (
      <Labelled id={path} label={label}>
        <NativeSelect
          id={path}
          value={(value as string | null) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        >
          {nullable ? <option value="">{f.notSet}</option> : null}
          {node.values.map((v) => (
            <option key={v} value={v}>
              {valueLabel(labelPath, v)}
            </option>
          ))}
        </NativeSelect>
      </Labelled>
    );

  if (node.kind === "boolean") {
    if (nullable)
      return (
        <Labelled id={path} label={label}>
          <NativeSelect
            id={path}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
          >
            <option value="">{f.any}</option>
            <option value="true">{f.yes}</option>
            <option value="false">{f.no}</option>
          </NativeSelect>
        </Labelled>
      );
    return (
      <CheckRow id={path} label={label} checked={value === true} onChange={(v) => onChange(v)} />
    );
  }

  if (node.kind === "number") {
    const unit = unitOf(key);
    return (
      <Labelled id={path} label={label} unit={unit ? f[unit] : undefined}>
        <NumberField
          id={path}
          value={(value as number | null) ?? null}
          nullable={nullable}
          scale={unit === "hours" ? 60 : unit === "percent" ? 100 : 1}
          int={node.int}
          onChange={onChange}
        />
      </Labelled>
    );
  }

  if (node.kind === "string") {
    const s = (value as string | null) ?? "";
    const set = (v: string) => onChange(v === "" && nullable ? null : v);
    if (node.format === "month_day")
      return <MonthDayField id={path} label={label} value={s} onChange={set} />;
    return (
      <Labelled id={path} label={label}>
        {node.format === "date" ? (
          <Input id={path} type="date" value={s} onChange={(e) => set(e.target.value)} />
        ) : node.format === "time" ? (
          <Input
            id={path}
            inputMode="numeric"
            placeholder="HH:MM"
            className="w-28 tabular"
            value={s}
            onChange={(e) => set(e.target.value)}
          />
        ) : node.format === "pay_code" ? (
          <>
            <Input
              id={path}
              list={`${path}-codes`}
              className="font-mono"
              placeholder={nullable ? f.notSet : undefined}
              value={s}
              onChange={(e) => set(e.target.value.toUpperCase())}
            />
            <datalist id={`${path}-codes`}>
              {payCodes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        ) : (
          <TextField
            id={path}
            value={s}
            placeholder={nullable ? f.notSet : undefined}
            onChange={set}
          />
        )}
      </Labelled>
    );
  }

  return null;
}

function Labelled({
  id,
  label,
  unit,
  hint,
  children,
}: {
  id: string;
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {unit ? <span className="font-normal text-muted-foreground"> ({unit})</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-9 cursor-pointer items-center gap-2 self-end text-sm pointer-coarse:min-h-11"
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function TextField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <Input
      id={id}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

const show = (n: number, scale: number) =>
  String(Math.round((n / scale) * 100) / 100).replace(".", ",");

/** A number typed in Danish (shown in hours or percent), kept as text while typing. */
function NumberField({
  id,
  value,
  nullable,
  scale,
  int,
  onChange,
}: {
  id: string;
  value: number | null;
  nullable: boolean;
  scale: number;
  int: boolean;
  onChange: (n: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : show(value, scale));
  return (
    <Input
      id={id}
      inputMode="decimal"
      className="w-32 text-right tabular"
      placeholder={nullable ? f.notSet : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === "") {
          if (nullable) onChange(null);
          return;
        }
        const v = parseDanishDecimal(e.target.value);
        if (v === null) return;
        const n = v * scale;
        onChange(int ? Math.round(n) : Math.round(n * 10000) / 10000);
      }}
    />
  );
}

/** "MM-DD" as a day and a month. */
function MonthDayField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [m = "01", d = "01"] = value.split("-");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <fieldset className="grid content-start gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <NativeSelect
          id={id}
          aria-label={`${label}: ${f.day}`}
          className="w-20"
          value={d}
          onChange={(e) => onChange(`${m}-${e.target.value}`)}
        >
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i} value={pad(i + 1)}>
              {i + 1}.
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={`${label}: ${f.month}`}
          value={m}
          onChange={(e) => onChange(`${e.target.value}-${d}`)}
        >
          {f.months.map((name, i) => (
            <option key={name} value={pad(i + 1)}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Helligdage
// ---------------------------------------------------------------------------
/** Every known day with a tick box, and a whole or half day (holiday from a time). */
export function HolidayCalendarFields({
  id,
  value,
  year,
  onChange,
}: {
  id: string;
  value: HolidayParams;
  year: number;
  onChange: (v: { holidays: string[]; partial: { key: string; from: string }[] }) => void;
}) {
  const h = t.holidayForm;
  const rows = holidayRows({ holidays: value.holidays ?? [], partial: value.partial ?? [] }, year);
  return (
    <fieldset className="grid gap-2" data-testid="holiday-calendar">
      <legend className="sr-only">{h.title}</legend>
      <ul className="grid divide-y rounded-lg border">
        {rows.map((r) => {
          const name = h.names[r.key] ?? humanize(r.key);
          const rowId = `${id}-${r.key}`;
          return (
            <li
              key={r.key}
              data-holiday={r.key}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2",
                !r.on && "text-muted-foreground",
              )}
            >
              <label
                htmlFor={rowId}
                className="flex min-h-9 min-w-56 flex-1 cursor-pointer items-center gap-3 pointer-coarse:min-h-11"
              >
                <input
                  id={rowId}
                  type="checkbox"
                  aria-label={name}
                  className="size-4 accent-primary"
                  checked={r.on}
                  onChange={(e) => onChange(setHoliday(value, r.key, { on: e.target.checked }))}
                />
                <span className={cn("font-medium", r.on && "text-foreground")}>{name}</span>
                <span className="text-xs tabular text-muted-foreground">
                  {r.date ? formatDate(r.date) : h.notThisYear}
                </span>
              </label>
              {r.on ? (
                <div className="flex items-center gap-2">
                  <NativeSelect
                    aria-label={h.kind(name)}
                    value={r.from === null ? "whole" : "half"}
                    onChange={(e) =>
                      onChange(
                        setHoliday(value, r.key, {
                          on: true,
                          from: e.target.value === "half" ? "12:00" : null,
                        }),
                      )
                    }
                  >
                    <option value="whole">{h.whole}</option>
                    <option value="half">{h.half}</option>
                  </NativeSelect>
                  {r.from !== null ? (
                    <label className="flex items-center gap-2 text-sm">
                      {h.fromTime}
                      <Input
                        aria-label={h.time(name)}
                        inputMode="numeric"
                        placeholder="HH:MM"
                        className="w-24 tabular"
                        defaultValue={r.from}
                        onChange={(e) =>
                          /^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value) &&
                          onChange(setHoliday(value, r.key, { on: true, from: e.target.value }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
