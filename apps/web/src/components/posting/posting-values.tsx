"use client";
import { Field } from "@/components/form";
import { NativeSelect } from "@/components/ui/native-select";
import type { PostingDimension } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";

/**
 * One select per dimension for a posting that covers a whole shift or item
 * ({dimension id: value id}; empty = the defaults). Posts `name` as JSON.
 */
export function PostingValuesSelect({
  dimensions,
  value,
  onChange,
  name,
}: {
  dimensions: PostingDimension[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  name?: string;
}) {
  return (
    <>
      {name ? <input type="hidden" name={name} value={JSON.stringify(value)} /> : null}
      {dimensions.map((d) => (
        <Field key={d.id} label={`${d.name} (${da.common.optional})`} htmlFor={`posting-${d.id}`}>
          <NativeSelect
            id={`posting-${d.id}`}
            value={value[d.id] ?? ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next[d.id] = e.target.value;
              else delete next[d.id];
              onChange(next);
            }}
          >
            <option value="">{da.posting.useDefault}</option>
            {d.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} {v.name}
              </option>
            ))}
            {value[d.id] && !d.values.some((v) => v.id === value[d.id]) ? (
              <option value={value[d.id]}>{da.posting.unavailableValue}</option>
            ) : null}
          </NativeSelect>
        </Field>
      ))}
    </>
  );
}
