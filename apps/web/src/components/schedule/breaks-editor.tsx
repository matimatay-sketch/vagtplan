"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { EditableBreak } from "@/lib/domain/breaks";
import { da } from "@/lib/i18n/da";
import { formatSupplementAmount } from "@/lib/domain/supplements";

/** Controlled list of breaks; posts a JSON field named `name`. */
export function BreaksEditor({
  value,
  onChange,
  name = "breaks",
  error,
}: {
  value: EditableBreak[];
  onChange: (next: EditableBreak[]) => void;
  name?: string;
  error?: string | undefined;
}) {
  const t = da.schedule;
  const update = (i: number, patch: Partial<EditableBreak>) =>
    onChange(value.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const paid = value.filter((b) => b.paid).reduce((s, b) => s + (b.minutes || 0), 0);
  const unpaid = value.filter((b) => !b.paid).reduce((s, b) => s + (b.minutes || 0), 0);
  return (
    <fieldset className="grid gap-2" data-testid="breaks-editor">
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
        {t.breaks}
        <span className="text-xs font-normal text-muted-foreground tabular">
          {t.paid}: {paid} min · {t.unpaid}: {unpaid} min
        </span>
      </legend>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {value.length === 0 ? <p className="text-xs text-muted-foreground">{t.noBreaks}</p> : null}
      {value.map((b, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_5.5rem_7rem_auto] items-center gap-2"
          data-testid="break-row"
        >
          <Input
            type="time"
            step={300}
            value={b.start}
            onChange={(e) => update(i, { start: e.target.value })}
            aria-label={`${t.breakStart} (${t.breakStartHelp})`}
            title={t.breakStartHelp}
          />
          <Input
            type="number"
            min={1}
            max={600}
            step={5}
            value={b.minutes || ""}
            onChange={(e) => update(i, { minutes: Number(e.target.value) })}
            aria-label={t.breakLength}
          />
          <NativeSelect
            value={b.paid ? "paid" : "unpaid"}
            onChange={(e) => update(i, { paid: e.target.value === "paid" })}
            aria-label={t.paid}
          >
            <option value="unpaid">{t.unpaid}</option>
            <option value="paid">{t.paid}</option>
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
            aria-label={t.removeBreak}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...value, { start: "", minutes: 30, paid: false }])}
      >
        <Plus /> {t.addBreak}
      </Button>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  );
}

export type SupplementOption = {
  id: string;
  name: string;
  amountType: "per_hour" | "fixed" | "percent";
  amount: number;
};

/** Checkbox list of supplement types; posts a JSON field named `name`. */
export function SupplementPicker({
  options,
  value,
  onChange,
  name = "supplement_type_ids",
}: {
  options: SupplementOption[];
  value: string[];
  onChange: (next: string[]) => void;
  name?: string;
}) {
  const t = da.schedule;
  return (
    <fieldset className="grid gap-1.5" data-testid="supplement-picker">
      <legend className="mb-1 text-sm font-medium">{t.supplements}</legend>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.noSupplementTypes}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-secondary"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
              />
              {o.name}
              <span className="text-xs text-muted-foreground">{formatSupplementAmount(o)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
