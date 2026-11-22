"use client";
import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarX2 } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { endSubstituteAction, saveSubstituteAction } from "@/lib/actions/substitutes";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

const t = da.substitutes;

export type Candidate = { user_id: string; name: string; approves: boolean };
export type SubstituteValues = {
  id?: string;
  absent_user_id: string;
  substitute_user_id: string;
  valid_from: string;
  valid_to: string;
  note: string;
};

/**
 * Creates or changes a substitute approver. Without users.manage the absent
 * user is the user themself. Field ids get the row id as prefix when editing.
 */
export function SubstituteForm({
  candidates,
  canChooseAbsent,
  me,
  initial,
}: {
  candidates: Candidate[];
  canChooseAbsent: boolean;
  me: string;
  initial?: SubstituteValues;
}) {
  const [state, action] = useActionState(saveSubstituteAction, initialActionState);
  const router = useRouter();
  const p = initial?.id ? `${initial.id}-` : "";
  const value = (k: keyof SubstituteValues) => state.values?.[k] ?? initial?.[k] ?? "";
  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  const err = (k: string) => state.errors?.[k];
  return (
    <form action={action} className="grid gap-4" noValidate data-testid="substitute-form">
      <FormMessage state={state.ok ? {} : state} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {canChooseAbsent ? (
          <Field label={t.absent} htmlFor={`${p}absent_user_id`} error={err("absent_user_id")}>
            <NativeSelect
              id={`${p}absent_user_id`}
              name="absent_user_id"
              defaultValue={value("absent_user_id") || me}
            >
              {candidates
                .filter((c) => c.approves || c.user_id === value("absent_user_id"))
                .map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="absent_user_id" value={me} />
        )}
        <Field
          label={t.substitute}
          htmlFor={`${p}substitute_user_id`}
          error={err("substitute_user_id")}
        >
          <NativeSelect
            id={`${p}substitute_user_id`}
            name="substitute_user_id"
            defaultValue={value("substitute_user_id")}
          >
            <option value="">–</option>
            {candidates.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.from} htmlFor={`${p}valid_from`} error={err("valid_from")}>
          <Input
            id={`${p}valid_from`}
            name="valid_from"
            type="date"
            defaultValue={value("valid_from")}
          />
        </Field>
        <Field label={t.to} htmlFor={`${p}valid_to`} error={err("valid_to")}>
          <Input id={`${p}valid_to`} name="valid_to" type="date" defaultValue={value("valid_to")} />
        </Field>
        <Field label={t.note} htmlFor={`${p}note`} error={err("note")}>
          <Input
            id={`${p}note`}
            name="note"
            placeholder={t.notePlaceholder}
            defaultValue={value("note")}
          />
        </Field>
      </div>
      <div>
        <SubmitButton>{initial?.id ? t.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

export function EndSubstituteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.endConfirm)) return;
        start(async () => {
          const r = await endSubstituteAction(id);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.ok) router.refresh();
        });
      }}
    >
      <CalendarX2 /> {t.end}
    </Button>
  );
}
