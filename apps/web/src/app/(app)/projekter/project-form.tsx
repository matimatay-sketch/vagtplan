"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { saveProjectAction } from "@/lib/actions/projects";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Project = {
  id: string;
  number: string;
  name: string;
  customer: string | null;
  departmentIds: string[];
};

/** Creates a project, or edits one when `project` is given. */
export function ProjectForm({
  departments,
  project,
  onDone,
}: {
  departments: { id: string; name: string }[];
  project?: Project;
  onDone?: () => void;
}) {
  const t = da.projects;
  const [state, action] = useActionState(saveProjectAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<string[]>(project?.departmentIds ?? []);
  useEffect(() => {
    if (!state.ok) return;
    if (project) onDone?.();
    else ref.current?.reset();
  }, [state, project, onDone]);
  const f = (name: string, fallback?: string) => fieldProps(name, state, fallback);
  const prefix = project ? `p-${project.id}-` : "";
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4"
      noValidate
      data-testid={project ? "project-edit-form" : "project-form"}
    >
      <FormMessage state={state} />
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
        <Field label={t.number} htmlFor={`${prefix}number`} error={state.errors?.number}>
          <Input {...f("number", project?.number)} id={`${prefix}number`} placeholder="Fx P-1001" />
        </Field>
        <Field label={t.name} htmlFor={`${prefix}name`} error={state.errors?.name}>
          <Input {...f("name", project?.name)} id={`${prefix}name`} />
        </Field>
        <Field
          label={`${t.customer} (${da.common.optional})`}
          htmlFor={`${prefix}customer`}
          error={state.errors?.customer}
        >
          <Input {...f("customer", project?.customer ?? "")} id={`${prefix}customer`} />
        </Field>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">
          {t.departments}{" "}
          <span className="font-normal text-muted-foreground">
            ({selected.length === 0 ? t.allDepartments : selected.length})
          </span>
        </legend>
        <input type="hidden" name="department_ids" value={JSON.stringify(selected)} />
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => {
            const on = selected.includes(d.id);
            return (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-secondary"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={on}
                  onChange={() =>
                    setSelected(on ? selected.filter((x) => x !== d.id) : [...selected, d.id])
                  }
                />
                {d.name}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t.departmentsHelp}</p>
      </fieldset>
      <div>
        <SubmitButton>{project ? da.common.save : t.new}</SubmitButton>
      </div>
    </form>
  );
}
