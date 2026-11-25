"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { da } from "@/lib/i18n/da";

const t = da.scope;

export type ScopeOptions = {
  departments: { id: string; name: string }[];
  agreements: { id: string; name: string }[];
  /** Omitted where groups do not apply (supplement types). */
  groups?: { id: string; name: string }[];
};

/**
 * "Gælder for": departments, agreements and employee groups. Nothing chosen
 * in a list means all. Folded away unless something is chosen.
 */
export function ScopeFields({
  prefix,
  options,
  initial,
}: {
  prefix: string;
  options: ScopeOptions;
  initial?: { department_ids?: string[]; agreement_ids?: string[]; employee_group_ids?: string[] };
}) {
  const lists = [
    {
      name: "department_ids",
      label: t.departments,
      items: options.departments,
      chosen: initial?.department_ids,
    },
    {
      name: "agreement_ids",
      label: t.agreements,
      items: options.agreements,
      chosen: initial?.agreement_ids,
    },
    ...(options.groups
      ? [
          {
            name: "employee_group_ids",
            label: t.groups,
            items: options.groups,
            chosen: initial?.employee_group_ids,
          },
        ]
      : []),
  ].filter((l) => l.items.length > 0);
  if (lists.length === 0) return null;
  const used = lists.some((l) => (l.chosen ?? []).length > 0);
  return (
    <details open={used} className="rounded-lg border p-3" data-testid="scope-fields">
      <summary className="min-h-9 cursor-pointer text-sm font-medium pointer-coarse:min-h-11">
        {t.title}
      </summary>
      <p className="mb-2 text-xs text-muted-foreground">{t.help}</p>
      <div className="grid gap-3">
        {lists.map((l) => (
          <fieldset key={l.name} className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">{l.label}</legend>
            <div className="flex flex-wrap gap-x-4">
              {l.items.map((x) => (
                <label
                  key={x.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
                >
                  <Checkbox
                    id={`${prefix}${l.name}-${x.id}`}
                    name={l.name}
                    value={x.id}
                    defaultChecked={(l.chosen ?? []).includes(x.id)}
                  />
                  {x.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}
