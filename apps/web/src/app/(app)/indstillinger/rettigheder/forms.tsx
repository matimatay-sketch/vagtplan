"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { archiveProfileAction, createProfileAction, saveGrantsAction } from "@/lib/actions/access";
import { initialActionState } from "@/lib/actions/state";
import {
  PERMISSIONS,
  SCOPE_LABELS,
  type PermissionScope,
  type Permissions,
} from "@/lib/permissions";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export function CreateProfileForm() {
  const [state, action] = useActionState(createProfileAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3" noValidate>
      <Field label={da.profiles.new} htmlFor="name" error={state.errors?.name}>
        <Input placeholder="Fx Vagtplanlægger" {...fieldProps("name", state)} />
      </Field>
      <SubmitButton variant="outline">{da.common.create}</SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}

const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
const options: (PermissionScope | "")[] = ["", "departments", "organization"];

export function GrantMatrix({
  profileId,
  grants,
  locked,
}: {
  profileId: string;
  grants: Permissions;
  locked: boolean;
}) {
  const [state, action] = useActionState(saveGrantsAction, initialActionState);
  return (
    <form action={action} className="grid gap-6" data-testid="grant-matrix">
      <input type="hidden" name="profile_id" value={profileId} />
      {groups.map((group) => (
        <fieldset key={group} className="grid gap-1" disabled={locked}>
          <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group}
          </legend>
          {PERMISSIONS.filter((p) => p.group === group).map((p) => (
            <div
              key={p.key}
              role="radiogroup"
              aria-label={p.label}
              className="flex flex-col gap-2 rounded-lg px-3 py-2 odd:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-medium">{p.label}</span>
              <span className="inline-flex rounded-lg border bg-card p-0.5">
                {options.map((o) => {
                  const allowed = o === "" || (p.scopes as readonly string[]).includes(o);
                  const id = `${profileId}-${p.key}-${o || "none"}`;
                  return (
                    <label
                      key={o || "none"}
                      htmlFor={id}
                      className={cn(
                        "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        !allowed && "pointer-events-none opacity-30",
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        className="sr-only"
                        name={`perm:${p.key}`}
                        value={o}
                        disabled={!allowed}
                        defaultChecked={(grants[p.key] ?? "") === o}
                      />
                      {o === "" ? da.profiles.none : SCOPE_LABELS[o]}
                    </label>
                  );
                })}
              </span>
            </div>
          ))}
        </fieldset>
      ))}
      {locked ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>{da.profiles.save}</SubmitButton>
          <span className="text-xs text-muted-foreground">{da.profiles.impliedNote}</span>
        </div>
      )}
      <FormMessage state={state} />
    </form>
  );
}

export function ArchiveProfileForm({ profileId }: { profileId: string }) {
  const [state, action] = useActionState(archiveProfileAction, initialActionState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="profile_id" value={profileId} />
      <SubmitButton variant="ghost" className="justify-self-start text-destructive">
        {da.profiles.archive}
      </SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}
