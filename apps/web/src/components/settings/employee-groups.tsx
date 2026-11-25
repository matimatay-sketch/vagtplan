"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyDetails } from "@/components/lazy-details";
import { archiveEmployeeGroupAction, saveEmployeeGroupAction } from "@/lib/actions/employee-groups";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

type Kind = "group" | "competence";
const texts = (k: Kind) => (k === "group" ? da.employeeGroups : da.competences);

function GroupForm({ group, kind }: { group?: { id: string; name: string }; kind: Kind }) {
  const t = texts(kind);
  const [state, action] = useActionState(saveEmployeeGroupAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      if (!group) ref.current?.reset();
      router.refresh();
    }
  }, [state, group, router]);
  const id = group ? `${kind}-${group.id}` : `${kind}-new`;
  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
      data-testid={group ? `${kind}-form-${group.name}` : `${kind}-form`}
    >
      <input type="hidden" name="kind" value={kind} />
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <Field
        label={group ? t.nameLabel : t.name}
        htmlFor={id}
        error={state.errors?.name}
        className="flex-1"
      >
        <Input id={id} name="name" placeholder={t.placeholder} defaultValue={group?.name} />
      </Field>
      <SubmitButton variant={group ? "outline" : "default"}>
        {group ? t.saveName : t.create}
      </SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}

/** The organization's employee groups or competences: create, rename and delete. */
export function EmployeeGroups({
  groups,
  kind = "group",
}: {
  groups: { id: string; name: string }[];
  kind?: Kind;
}) {
  const t = texts(kind);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-4">
      <GroupForm kind={kind} />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.none}</p>
      ) : (
        <ul
          className="grid divide-y rounded-lg border"
          data-testid={kind === "group" ? "employee-groups" : "competences"}
        >
          {groups.map((g) => (
            <li key={g.id} className="grid gap-2 px-3 py-2" data-group={g.name}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{g.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`${t.remove} ${g.name}`}
                  onClick={() => {
                    if (!window.confirm(t.removeConfirm(g.name))) return;
                    start(async () => {
                      const r = await archiveEmployeeGroupAction(g.id, kind);
                      if (r.ok) toast.success(r.message);
                      else toast.error(r.message);
                      router.refresh();
                    });
                  }}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {t.remove}
                </Button>
              </div>
              <LazyDetails summary={t.rename} summaryClassName="text-sm">
                <div className="mt-2">
                  <GroupForm group={g} kind={kind} />
                </div>
              </LazyDetails>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
