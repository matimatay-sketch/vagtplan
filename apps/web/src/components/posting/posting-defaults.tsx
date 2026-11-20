"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import { saveDefaultsAction } from "@/lib/actions/posting";
import type { PostingDimension, PostingValues } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";

const t = da.posting;

/** Standard posting of a department or an employee: a value per dimension (or none). */
export function PostingDefaultsForm({
  kind,
  id,
  dimensions,
  value,
  departmentId,
}: {
  kind: "department" | "employee";
  id: string;
  dimensions: PostingDimension[];
  value: PostingValues;
  /** Only values available in this department are offered. */
  departmentId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<PostingValues>(value);
  if (dimensions.length === 0) return null;
  return (
    <form
      className="grid gap-3"
      data-testid={`posting-defaults-${kind}`}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveDefaultsAction(kind, id, values);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.ok) router.refresh();
        });
      }}
    >
      <p className="text-xs text-muted-foreground">{t.defaultsHelp}</p>
      <div className="flex flex-wrap items-end gap-3">
        {dimensions.map((d) => (
          <Field key={d.id} label={d.name} htmlFor={`${kind}-${id}-${d.key}`}>
            <NativeSelect
              id={`${kind}-${id}-${d.key}`}
              value={values[d.id] ?? ""}
              onChange={(e) => {
                const next = { ...values };
                if (e.target.value) next[d.id] = e.target.value;
                else delete next[d.id];
                setValues(next);
              }}
            >
              <option value="">{t.none}</option>
              {d.values
                .filter(
                  (v) =>
                    !departmentId ||
                    v.departmentIds.length === 0 ||
                    v.departmentIds.includes(departmentId),
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        ))}
        <Button variant="outline" disabled={pending}>
          {da.common.saveDefaults}
        </Button>
      </div>
    </form>
  );
}
