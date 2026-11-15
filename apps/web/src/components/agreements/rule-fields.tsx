"use client";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import { formatKroner, parseDanishDecimal, parseKroner } from "@/lib/domain/numbers";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

const t = da.agreements.ruleForms;

export type AppliesTo = {
  staff_groups?: string[] | null;
  pay_forms?: ("hourly" | "monthly")[] | null;
};
export type Stacking = {
  mode?: "additive" | "highest" | "exclusive";
  group?: string | null;
  replaces?: string[];
};
type Amount = { type: "ore_per_hour"; ore: number } | { type: "percent_of_base"; bp: number };

const toggle = <T,>(list: readonly T[], v: T, on: boolean) =>
  on ? [...new Set([...list, v])] : list.filter((x) => x !== v);

// ---------------------------------------------------------------------------
// Money and percentages typed in Danish, kept as text while typing.
// ---------------------------------------------------------------------------
export function KronerField({
  id,
  label,
  ore,
  onChange,
}: {
  id: string;
  label: string;
  ore: number;
  onChange: (ore: number) => void;
}) {
  const [text, setText] = useState(() => formatKroner(ore));
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseKroner(e.target.value);
          if (v !== null && v >= 0) onChange(v);
        }}
      />
    </Field>
  );
}

function PercentField({
  id,
  label,
  bp,
  onChange,
}: {
  id: string;
  label: string;
  bp: number;
  onChange: (bp: number) => void;
}) {
  const [text, setText] = useState(() => String(bp / 100).replace(".", ","));
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseDanishDecimal(e.target.value);
          if (v !== null && v >= 0) onChange(Math.round(v * 100));
        }}
      />
    </Field>
  );
}

/** Kr. per hour or % of the hourly base. */
export function AmountFields({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Amount;
  onChange: (a: Amount) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.amount} htmlFor={`${id}-type`}>
        <NativeSelect
          id={`${id}-type`}
          value={value.type}
          onChange={(e) =>
            onChange(
              e.target.value === "percent_of_base"
                ? { type: "percent_of_base", bp: 0 }
                : { type: "ore_per_hour", ore: 0 },
            )
          }
        >
          {(["ore_per_hour", "percent_of_base"] as const).map((k) => (
            <option key={k} value={k}>
              {t.amountTypes[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {value.type === "ore_per_hour" ? (
        <KronerField
          key="kr"
          id={`${id}-value`}
          label={t.amountTypes.ore_per_hour}
          ore={value.ore}
          onChange={(ore) => onChange({ type: "ore_per_hour", ore })}
        />
      ) : (
        <PercentField
          key="pct"
          id={`${id}-value`}
          label={t.amountTypes.percent_of_base}
          bp={value.bp}
          onChange={(bp) => onChange({ type: "percent_of_base", bp })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gælder for: staff groups and pay forms (empty = everyone).
// ---------------------------------------------------------------------------
export function AppliesToFields({
  id,
  value,
  staffGroups,
  onChange,
}: {
  id: string;
  value: AppliesTo | undefined;
  staffGroups: readonly string[];
  onChange: (v: AppliesTo | undefined) => void;
}) {
  const groups = value?.staff_groups ?? [];
  const forms = value?.pay_forms ?? [];
  const [draft, setDraft] = useState("");
  const set = (next: { groups?: string[]; forms?: ("hourly" | "monthly")[] }) => {
    const g = next.groups ?? groups;
    const f = next.forms ?? forms;
    const out: AppliesTo = {};
    if (g.length) out.staff_groups = g;
    if (f.length) out.pay_forms = f;
    onChange(g.length || f.length ? out : undefined);
  };
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    set({ groups: toggle(groups, name, true) });
    setDraft("");
  };
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3" data-testid="applies-to">
      <legend className="px-1 text-sm font-medium">{t.appliesTo}</legend>
      <p className="text-xs text-muted-foreground">{t.appliesToHelp}</p>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t.staffGroups}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {groups.length === 0 ? (
            <span className="text-sm text-muted-foreground">{t.everyone}</span>
          ) : null}
          {groups.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
              data-staff-group={g}
            >
              {g}
              <button
                type="button"
                aria-label={t.removeStaffGroup(g)}
                onClick={() => set({ groups: groups.filter((x) => x !== g) })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${id}-staff-group`}
            aria-label={t.staffGroupAdd}
            className="max-w-56"
            list={`${id}-staff-groups`}
            placeholder={t.staffGroupPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <datalist id={`${id}-staff-groups`}>
            {staffGroups
              .filter((g) => !groups.includes(g))
              .map((g) => (
                <option key={g} value={g} />
              ))}
          </datalist>
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus /> {t.staffGroupAdd}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-xs font-medium text-muted-foreground">{t.payForms}</span>
        {(["hourly", "monthly"] as const).map((f) => (
          <label key={f} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary"
              checked={forms.includes(f)}
              onChange={(e) => set({ forms: toggle(forms, f, e.target.checked) })}
            />
            {t.payFormLabels[f]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Lager · Timeløn" or "Alle". */
export function appliesToText(v: AppliesTo | undefined): string {
  const parts = [
    ...(v?.staff_groups ?? []),
    ...(v?.pay_forms ?? []).map((f) => t.payFormLabels[f]),
  ];
  return parts.length ? parts.join(" · ") : t.everyone;
}

// ---------------------------------------------------------------------------
// Stacking with other supplements and priority.
// ---------------------------------------------------------------------------
export function StackingFields({
  id,
  stacking,
  priority,
  otherRules,
  onChange,
}: {
  id: string;
  stacking: Stacking | undefined;
  priority: number | undefined;
  otherRules: { id: string; label: string }[];
  onChange: (patch: { stacking?: Stacking; priority?: number }) => void;
}) {
  const s = { mode: "additive" as const, group: null, replaces: [] as string[], ...stacking };
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3" data-testid="stacking">
      <legend className="px-1 text-sm font-medium">{t.stacking}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.stackingMode} htmlFor={`${id}-mode`}>
          <NativeSelect
            id={`${id}-mode`}
            value={s.mode}
            onChange={(e) =>
              onChange({ stacking: { ...s, mode: e.target.value as Stacking["mode"] } })
            }
          >
            {(["additive", "highest", "exclusive"] as const).map((m) => (
              <option key={m} value={m}>
                {t.stackingModes[m]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.stackingGroup} htmlFor={`${id}-group`}>
          <Input
            id={`${id}-group`}
            value={s.group ?? ""}
            onChange={(e) => onChange({ stacking: { ...s, group: e.target.value || null } })}
          />
        </Field>
        <Field label={t.priority} htmlFor={`${id}-priority`}>
          <Input
            id={`${id}-priority`}
            type="number"
            value={priority ?? 0}
            onChange={(e) => onChange({ priority: Math.trunc(Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.stackingGroupHelp} {t.priorityHelp}
      </p>
      {otherRules.length ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t.replaces}</span>
          {otherRules.map((r) => (
            <label key={r.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary"
                checked={s.replaces.includes(r.id)}
                onChange={(e) =>
                  onChange({
                    stacking: { ...s, replaces: toggle(s.replaces, r.id, e.target.checked) },
                  })
                }
              />
              {r.label}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Tidsvinduestillæg.
// ---------------------------------------------------------------------------
const DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "weekday",
  "holiday",
  "any",
] as const;
type Day = (typeof DAYS)[number];
type Window = { days: Day[]; from: string; to: string };
export type SupplementParams = {
  windows: Window[];
  exclude_holidays?: boolean;
  amount: Amount;
  pay_code: string;
  exclude_overtime?: boolean;
};

export function SupplementFields({
  id,
  value,
  payCodes,
  onChange,
}: {
  id: string;
  value: SupplementParams;
  payCodes: readonly string[];
  onChange: (p: SupplementParams) => void;
}) {
  const setWindow = (i: number, w: Partial<Window>) =>
    onChange({ ...value, windows: value.windows.map((x, k) => (k === i ? { ...x, ...w } : x)) });
  return (
    <div className="grid gap-3" data-testid="supplement-fields">
      <div className="grid gap-3 sm:grid-cols-[18rem_1fr]">
        <PayCodeField
          id={id}
          value={value.pay_code}
          payCodes={payCodes}
          onChange={(pay_code) => onChange({ ...value, pay_code })}
        />
        <AmountFields
          id={`${id}-amount`}
          value={value.amount}
          onChange={(amount) => onChange({ ...value, amount })}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t.windows}</legend>
        {value.windows.map((w, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-2" data-testid="supplement-window">
            <div className="flex flex-wrap gap-1" role="group" aria-label={`${t.days} ${i + 1}`}>
              {DAYS.map((d) => {
                const on = w.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted",
                    )}
                    onClick={() => setWindow(i, { days: toggle(w.days, d, !on) })}
                  >
                    {t.dayLabels[d]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t.from} htmlFor={`${id}-w${i}-from`}>
                <Input
                  id={`${id}-w${i}-from`}
                  type="time"
                  value={w.from}
                  onChange={(e) => setWindow(i, { from: e.target.value })}
                />
              </Field>
              <Field label={t.to} htmlFor={`${id}-w${i}-to`}>
                {/* 24:00 is a valid end; a text field keeps it typeable. */}
                <Input
                  id={`${id}-w${i}-to`}
                  className="w-28"
                  placeholder="24:00"
                  value={w.to}
                  onChange={(e) => setWindow(i, { to: e.target.value })}
                />
              </Field>
              {value.windows.length > 1 ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t.removeWindow}
                  onClick={() =>
                    onChange({ ...value, windows: value.windows.filter((_, k) => k !== i) })
                  }
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            onChange({
              ...value,
              windows: [...value.windows, { days: ["weekday"], from: "00:00", to: "24:00" }],
            })
          }
        >
          <Plus /> {t.addWindow}
        </Button>
      </fieldset>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary"
            checked={value.exclude_holidays ?? true}
            onChange={(e) => onChange({ ...value, exclude_holidays: e.target.checked })}
          />
          {t.excludeHolidays}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary"
            checked={value.exclude_overtime ?? false}
            onChange={(e) => onChange({ ...value, exclude_overtime: e.target.checked })}
          />
          {t.excludeOvertime}
        </label>
      </div>
    </div>
  );
}

function PayCodeField({
  id,
  value,
  payCodes,
  onChange,
}: {
  id: string;
  value: string;
  payCodes: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={t.payCode} htmlFor={`${id}-paycode`}>
      <Input
        id={`${id}-paycode`}
        className="font-mono"
        list={`${id}-paycodes`}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <datalist id={`${id}-paycodes`}>
        {payCodes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Lønsats: a table of rates by staff group, pay step, age and dates.
// ---------------------------------------------------------------------------
type Rate = {
  staff_group?: string | null;
  pay_step?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  hourly_ore: number;
};
export type PayRateParams = { pay_code: string; rates: Rate[] };

const optionalInt = (v: string) =>
  v.trim() === "" ? null : Math.max(0, Math.trunc(Number(v) || 0));

export function PayRateFields({
  id,
  value,
  payCodes,
  staffGroups,
  onChange,
}: {
  id: string;
  value: PayRateParams;
  payCodes: readonly string[];
  staffGroups: readonly string[];
  onChange: (p: PayRateParams) => void;
}) {
  const setRate = (i: number, r: Partial<Rate>) =>
    onChange({ ...value, rates: value.rates.map((x, k) => (k === i ? { ...x, ...r } : x)) });
  return (
    <div className="grid gap-3" data-testid="pay-rate-fields">
      <div className="max-w-48">
        <PayCodeField
          id={id}
          value={value.pay_code}
          payCodes={payCodes}
          onChange={(pay_code) => onChange({ ...value, pay_code })}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-sm font-medium">{t.rates}</span>
        <p className="text-xs text-muted-foreground">{t.ratesHelp}</p>
      </div>
      <datalist id={`${id}-rate-groups`}>
        {staffGroups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-1 py-1 font-medium">{t.staffGroup}</th>
              <th className="px-1 py-1 font-medium">{t.payStep}</th>
              <th className="px-1 py-1 font-medium">{t.minAge}</th>
              <th className="px-1 py-1 font-medium">{t.maxAge}</th>
              <th className="px-1 py-1 font-medium">{t.validFrom}</th>
              <th className="px-1 py-1 font-medium">{t.validTo}</th>
              <th className="px-1 py-1 font-medium">{t.hourly}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.rates.map((r, i) => (
              <tr key={i} data-testid="rate-row">
                <td className="px-1 py-1">
                  <Input
                    aria-label={`${t.staffGroup} ${i + 1}`}
                    list={`${id}-rate-groups`}
                    placeholder={t.everyone}
                    value={r.staff_group ?? ""}
                    onChange={(e) => setRate(i, { staff_group: e.target.value || null })}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`${t.payStep} ${i + 1}`}
                    placeholder={t.everyone}
                    value={r.pay_step ?? ""}
                    onChange={(e) => setRate(i, { pay_step: e.target.value || null })}
                  />
                </td>
                <td className="w-20 px-1 py-1">
                  <Input
                    aria-label={`${t.minAge} ${i + 1}`}
                    type="number"
                    min={0}
                    value={r.min_age ?? ""}
                    onChange={(e) => setRate(i, { min_age: optionalInt(e.target.value) })}
                  />
                </td>
                <td className="w-20 px-1 py-1">
                  <Input
                    aria-label={`${t.maxAge} ${i + 1}`}
                    type="number"
                    min={0}
                    value={r.max_age ?? ""}
                    onChange={(e) => setRate(i, { max_age: optionalInt(e.target.value) })}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`${t.validFrom} ${i + 1}`}
                    type="date"
                    value={r.valid_from ?? ""}
                    onChange={(e) => setRate(i, { valid_from: e.target.value || null })}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`${t.validTo} ${i + 1}`}
                    type="date"
                    value={r.valid_to ?? ""}
                    onChange={(e) => setRate(i, { valid_to: e.target.value || null })}
                  />
                </td>
                <td className="w-32 px-1 py-1">
                  <RateKroner
                    label={`${t.hourly} ${i + 1}`}
                    ore={r.hourly_ore}
                    onChange={(hourly_ore) => setRate(i, { hourly_ore })}
                  />
                </td>
                <td className="px-1 py-1">
                  {value.rates.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${t.removeRate} ${i + 1}`}
                      onClick={() =>
                        onChange({ ...value, rates: value.rates.filter((_, k) => k !== i) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() => onChange({ ...value, rates: [...value.rates, { hourly_ore: 0 }] })}
      >
        <Plus /> {t.addRate}
      </Button>
    </div>
  );
}

function RateKroner({
  label,
  ore,
  onChange,
}: {
  label: string;
  ore: number;
  onChange: (ore: number) => void;
}) {
  const [text, setText] = useState(() => formatKroner(ore));
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="text-right tabular"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseKroner(e.target.value);
        if (v !== null && v >= 0) onChange(v);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Lønarter: codes and labels.
// ---------------------------------------------------------------------------
export function PayCodesTable({
  value,
  used,
  onChange,
}: {
  value: Record<string, { label: string }>;
  used: readonly string[];
  onChange: (v: Record<string, { label: string }>) => void;
}) {
  const [code, setCode] = useState("");
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const missing = used.filter((c) => !(c in value));
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4" data-testid="pay-codes">
      <div>
        <h3 className="font-medium">{t.payCodesTitle}</h3>
        <p className="text-sm text-muted-foreground">{t.payCodesLead}</p>
      </div>
      <table className="w-full max-w-2xl text-sm">
        <tbody>
          {entries.map(([c, v]) => (
            <tr key={c} data-pay-code={c}>
              <td className="w-48 py-1 pr-2 font-mono text-xs">{c}</td>
              <td className="py-1 pr-2">
                <Input
                  aria-label={`${t.payCodeLabel} ${c}`}
                  value={v.label}
                  onChange={(e) => onChange({ ...value, [c]: { label: e.target.value } })}
                />
              </td>
              <td className="w-10 py-1">
                {used.includes(c) ? null : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`${t.removePayCode} ${c}`}
                    onClick={() => {
                      const { [c]: _gone, ...rest } = value;
                      onChange(rest);
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing.length ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-warning-foreground"
          data-testid="pay-codes-missing"
        >
          {t.payCodeMissing(missing.join(", "))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({ ...value, ...Object.fromEntries(missing.map((c) => [c, { label: c }])) })
            }
          >
            <Plus /> {t.addPayCode}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t.addPayCode}
          className="max-w-48 font-mono"
          placeholder="KODE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!code || code in value}
          onClick={() => {
            onChange({ ...value, [code]: { label: code } });
            setCode("");
          }}
        >
          <Plus /> {t.addPayCode}
        </Button>
      </div>
    </section>
  );
}
