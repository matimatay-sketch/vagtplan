"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form";
import { archivePostingAction, saveDimensionAction, saveValueAction } from "@/lib/actions/posting";
import type { PostingDimension } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";

const t = da.posting;
type Department = { id: string; name: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok?: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await f();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

function NewDimension() {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [required, setRequired] = useState(false);
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4"
      data-testid="new-dimension"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveDimensionAction({ name, key: key || slug(name), required }),
          () => {
            setName("");
            setKey("");
            setRequired(false);
          },
        );
      }}
    >
      <Field label={t.dimensionName} htmlFor="dim-name">
        <Input
          id="dim-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Omkostningssted"
        />
      </Field>
      <Field label={t.dimensionKey} htmlFor="dim-key">
        <Input
          id="dim-key"
          className="font-mono"
          value={key}
          placeholder={slug(name) || "omkostningssted"}
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm" title={t.requiredHelp}>
        <input
          type="checkbox"
          className="accent-primary"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        {t.required}
      </label>
      <Button disabled={pending || !name.trim()}>
        <Plus /> {t.newDimension}
      </Button>
    </form>
  );
}

function NewValue({
  dimensionId,
  departments,
}: {
  dimensionId: string;
  departments: Department[];
}) {
  const { pending, run } = useAction();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  return (
    <form
      className="grid gap-2 border-t pt-3"
      data-testid="new-value"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveValueAction({ dimension_id: dimensionId, code, name, department_ids: deps }),
          () => {
            setCode("");
            setName("");
            setDeps([]);
          },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.code} htmlFor={`${dimensionId}-code`}>
          <Input
            id={`${dimensionId}-code`}
            className="w-32 font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label={t.name} htmlFor={`${dimensionId}-name`}>
          <Input
            id={`${dimensionId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button variant="outline" disabled={pending || !code.trim() || !name.trim()}>
          <Plus /> {t.newValue}
        </Button>
      </div>
      {departments.length ? (
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <legend className="sr-only">{t.departments}</legend>
          <span className="text-xs text-muted-foreground">{t.departments}:</span>
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary"
                checked={deps.includes(d.id)}
                onChange={(e) =>
                  setDeps(e.target.checked ? [...deps, d.id] : deps.filter((x) => x !== d.id))
                }
              />
              {d.name}
            </label>
          ))}
          <span className="text-xs text-muted-foreground">
            ({t.allDepartments}, hvis ingen er valgt)
          </span>
        </fieldset>
      ) : null}
    </form>
  );
}

export function PostingSettings({
  dimensions,
  departments,
}: {
  dimensions: PostingDimension[];
  departments: Department[];
}) {
  const { pending, run } = useAction();
  const depName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  return (
    <div className="grid gap-6" data-testid="posting-settings">
      {dimensions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noDimensions}</p>
      ) : null}
      {dimensions.map((d) => (
        <section
          key={d.id}
          className="grid gap-3 rounded-xl border bg-card p-4"
          data-dimension={d.key}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{d.name}</h2>
            <span className="font-mono text-xs text-muted-foreground">{d.key}</span>
            {d.required ? <Badge variant="secondary">{t.required}</Badge> : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={pending}
              onClick={() => run(() => archivePostingAction("posting_dimension", d.id))}
            >
              <Archive /> {t.archive}
            </Button>
          </div>
          {d.values.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noValues}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">{t.code}</th>
                  <th className="py-1 pr-3 font-medium">{t.name}</th>
                  <th className="py-1 pr-3 font-medium">{t.departments}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.values.map((v) => (
                  <tr key={v.id} className="border-t" data-value={v.code}>
                    <td className="py-1.5 pr-3 font-mono">{v.code}</td>
                    <td className="py-1.5 pr-3">{v.name}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {v.departmentIds.length
                        ? v.departmentIds.map(depName).join(", ")
                        : t.allDepartments}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t.archive} ${v.code}`}
                        disabled={pending}
                        onClick={() => run(() => archivePostingAction("posting_value", v.id))}
                      >
                        <Archive />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <NewValue dimensionId={d.id} departments={departments} />
        </section>
      ))}
      <NewDimension />
    </div>
  );
}
