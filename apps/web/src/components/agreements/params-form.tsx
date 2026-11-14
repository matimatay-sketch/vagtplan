"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * Edits a rule's parameters by the shape of their values: numbers, text,
 * yes/no, nested groups, and lists (as JSON). A primitive's schema validates
 * the result when the draft is validated or saved.
 */
export function ParamsForm({
  value,
  onChange,
  path,
}: {
  value: Json;
  onChange: (next: Json) => void;
  path: string;
}) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="grid gap-2">
        {Object.entries(value).map(([k, v]) => (
          <div
            key={k}
            className={
              v !== null && typeof v === "object"
                ? "grid gap-1 rounded-lg border p-2"
                : "grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-2"
            }
          >
            <label htmlFor={`${path}.${k}`} className="font-mono text-xs text-muted-foreground">
              {k}
            </label>
            <ParamsForm
              value={v}
              path={`${path}.${k}`}
              onChange={(nv) => onChange({ ...value, [k]: nv })}
            />
          </div>
        ))}
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <Textarea
        id={path}
        aria-label={path}
        className="font-mono text-xs"
        rows={Math.min(8, 2 + JSON.stringify(value).length / 60)}
        defaultValue={JSON.stringify(value, null, 1)}
        onBlur={(e) => {
          try {
            onChange(JSON.parse(e.target.value) as Json);
          } catch {
            // Kept as typed; validation reports it.
          }
        }}
      />
    );
  }
  if (typeof value === "boolean")
    return (
      <input
        id={path}
        type="checkbox"
        className="size-4 accent-primary"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  if (typeof value === "number") return <NumberField id={path} value={value} onChange={onChange} />;
  // Text or empty (null): numbers and yes/no typed into an empty field keep their type.
  return (
    <Input
      id={path}
      className="h-8"
      placeholder="tom"
      value={value ?? ""}
      onChange={(e) => {
        const t = e.target.value;
        if (t === "") return onChange(null);
        if (value === null && /^-?\d+(\.\d+)?$/.test(t)) return onChange(Number(t));
        if (value === null && (t === "true" || t === "false")) return onChange(t === "true");
        onChange(t);
      }}
    />
  );
}

export type { Json };

/**
 * A number stays a number: an emptied field is kept as typed until it holds a
 * number again (clearing it would otherwise turn the value into "empty" and
 * swap the field mid-typing). Use the JSON view to empty a value.
 */
function NumberField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      id={id}
      type="number"
      step="any"
      className="h-8"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
