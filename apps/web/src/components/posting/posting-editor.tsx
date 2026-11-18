"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { EditablePostingRow, PostingDimension } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";

const t = da.posting;
const tp = da.projects;

/**
 * Posting rows on a shift or registration: a value per dimension, and the
 * whole shift (rest), a time span or a number of minutes. Posts JSON as `name`.
 */
export function PostingEditor({
  dimensions,
  value,
  onChange,
  name = "posting_allocations",
  error,
}: {
  dimensions: PostingDimension[];
  value: EditablePostingRow[];
  onChange: (next: EditablePostingRow[]) => void;
  name?: string;
  error?: string | undefined;
}) {
  if (dimensions.length === 0 && value.length === 0) return null;
  const update = (i: number, patch: Partial<EditablePostingRow>) =>
    onChange(value.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const hasRest = value.some((r) => r.mode === "rest");
  return (
    <fieldset className="grid gap-2" data-testid="posting-editor">
      <legend className="mb-1 text-sm font-medium">{t.onShift}</legend>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {value.length === 0 ? <p className="text-xs text-muted-foreground">{t.noPosting}</p> : null}
      {value.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-2" data-testid="posting-row">
          <div className="flex flex-wrap items-center gap-2">
            {dimensions.map((d) => (
              <NativeSelect
                key={d.id}
                value={r.values[d.id] ?? ""}
                aria-label={`${d.name} ${i + 1}`}
                className="min-w-40 flex-1"
                onChange={(e) => {
                  const values = { ...r.values };
                  if (e.target.value) values[d.id] = e.target.value;
                  else delete values[d.id];
                  update(i, { values });
                }}
              >
                <option value="">{d.name} …</option>
                {d.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </NativeSelect>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label={`${t.removeRow} ${i + 1}`}
            >
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={r.mode}
              onChange={(e) => update(i, { mode: e.target.value as EditablePostingRow["mode"] })}
              aria-label={`${tp.mode} ${i + 1}`}
              className="w-44"
            >
              <option value="rest">{tp.modes.rest}</option>
              <option value="span">{tp.modes.span}</option>
              <option value="minutes">{tp.modes.minutes}</option>
            </NativeSelect>
            {r.mode === "span" ? (
              <span className="flex items-center gap-1">
                <Input
                  type="time"
                  step={300}
                  value={r.from}
                  onChange={(e) => update(i, { from: e.target.value })}
                  aria-label={`${tp.from} ${i + 1}`}
                  className="w-32"
                />
                <span aria-hidden>–</span>
                <Input
                  type="time"
                  step={300}
                  value={r.to}
                  onChange={(e) => update(i, { to: e.target.value })}
                  aria-label={`${tp.to} ${i + 1}`}
                  className="w-32"
                />
              </span>
            ) : r.mode === "minutes" ? (
              <Input
                type="number"
                min={1}
                max={1440}
                step={15}
                value={r.minutes || ""}
                onChange={(e) => update(i, { minutes: Number(e.target.value) })}
                aria-label={`${tp.minutes} ${i + 1}`}
                className="w-28"
              />
            ) : null}
          </div>
        </div>
      ))}
      {dimensions.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            onChange([
              ...value,
              { values: {}, mode: hasRest ? "minutes" : "rest", from: "", to: "", minutes: 60 },
            ])
          }
        >
          <Plus /> {t.addRow}
        </Button>
      ) : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  );
}
