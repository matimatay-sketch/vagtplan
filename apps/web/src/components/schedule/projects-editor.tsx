"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { EditableProjectRow } from "@/lib/domain/projects";
import type { BoardProject } from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";

/** Controlled list of project allocations; posts a JSON field named `name`. */
export function ProjectsEditor({
  projects,
  value,
  onChange,
  name = "project_allocations",
  error,
}: {
  projects: BoardProject[];
  value: EditableProjectRow[];
  onChange: (next: EditableProjectRow[]) => void;
  name?: string;
  error?: string | undefined;
}) {
  const t = da.projects;
  if (projects.length === 0 && value.length === 0) return null;
  const update = (i: number, patch: Partial<EditableProjectRow>) =>
    onChange(value.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const hasRest = value.some((r) => r.mode === "rest");
  return (
    <fieldset className="grid gap-2" data-testid="projects-editor">
      <legend className="mb-1 text-sm font-medium">{t.onShift}</legend>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {value.length === 0 ? <p className="text-xs text-muted-foreground">{t.noProject}</p> : null}
      {value.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-2" data-testid="project-row">
          <div className="flex items-center gap-2">
            <NativeSelect
              value={r.project_id}
              onChange={(e) => update(i, { project_id: e.target.value })}
              aria-label={t.project}
              className="min-w-0 flex-1"
            >
              <option value="">{t.project} …</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.name}
                </option>
              ))}
              {r.project_id && !projects.some((p) => p.id === r.project_id) ? (
                <option value={r.project_id}>{t.project}</option>
              ) : null}
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label={t.removeRow}
            >
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={r.mode}
              onChange={(e) => update(i, { mode: e.target.value as EditableProjectRow["mode"] })}
              aria-label={t.mode}
              className="w-44"
            >
              <option value="rest">{t.modes.rest}</option>
              <option value="span">{t.modes.span}</option>
              <option value="minutes">{t.modes.minutes}</option>
            </NativeSelect>
            {r.mode === "span" ? (
              <span className="flex items-center gap-1">
                <Input
                  type="time"
                  step={300}
                  value={r.from}
                  onChange={(e) => update(i, { from: e.target.value })}
                  aria-label={t.from}
                  className="w-32"
                />
                <span aria-hidden>–</span>
                <Input
                  type="time"
                  step={300}
                  value={r.to}
                  onChange={(e) => update(i, { to: e.target.value })}
                  aria-label={t.to}
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
                aria-label={t.minutes}
                className="w-28"
              />
            ) : null}
          </div>
        </div>
      ))}
      {projects.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            onChange([
              ...value,
              {
                project_id: "",
                mode: hasRest ? "minutes" : "rest",
                from: "",
                to: "",
                minutes: 60,
              },
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
