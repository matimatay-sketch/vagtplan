"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LazyDetails } from "@/components/lazy-details";
import {
  addEmployeeCompetenceAction,
  removeEmployeeCompetenceAction,
} from "@/lib/actions/competences";
import { initialActionState } from "@/lib/actions/state";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

const t = da.competences;

export type HeldCompetence = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  hasDocument: boolean;
};

/** What the employee holds, and (with employees.manage) adding and removing it. */
export function EmployeeCompetences({
  employeeId,
  held,
  competences,
  canEdit,
  today,
}: {
  employeeId: string;
  held: HeldCompetence[];
  competences: { id: string; name: string }[];
  canEdit: boolean;
  today: string;
}) {
  const [state, action] = useActionState(addEmployeeCompetenceAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  const err = (k: string) => state.errors?.[k];
  return (
    <div className="grid gap-4">
      {held.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noneOnEmployee}</p>
      ) : (
        <ul className="grid gap-2" data-testid="employee-competences">
          {held.map((c) => {
            const expired = c.validTo !== null && c.validTo < today;
            return (
              <li
                key={c.id}
                data-competence={c.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <BadgeCheck
                    className={cn("size-4", expired ? "text-muted-foreground" : "text-success")}
                    aria-hidden
                  />
                  <span className={cn("font-medium", expired && "line-through")}>{c.name}</span>
                  <span
                    className={cn(
                      "text-xs",
                      expired ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {expired ? t.expired : c.validTo ? t.expires(formatDate(c.validTo)) : null}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {c.hasDocument ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/medarbejdere/certifikat/${c.id}`} target="_blank" rel="noreferrer">
                        <FileText /> {t.showCertificate}
                      </a>
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={pending}
                      aria-label={`${t.removeFromEmployee} ${c.name}`}
                      onClick={() =>
                        start(async () => {
                          const r = await removeEmployeeCompetenceAction(c.id);
                          if (!r.ok) toast.error(r.message);
                          router.refresh();
                        })
                      }
                    >
                      {pending ? <Loader2 className="animate-spin" /> : <X />}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && competences.length ? (
        <LazyDetails summary={t.add} summaryClassName="text-sm" testId="add-competence">
          <form
            ref={ref}
            action={action}
            className="mt-3 grid gap-4 sm:grid-cols-2"
            noValidate
            data-testid="competence-form"
          >
            <input type="hidden" name="employee_id" value={employeeId} />
            <Field label={t.competence} htmlFor="ec-competence" error={err("competence_id")}>
              <NativeSelect id="ec-competence" name="competence_id" defaultValue="">
                <option value="" disabled>
                  {t.competence}
                </option>
                {competences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.certificate} htmlFor="ec-certificate" error={err("certificate")}>
              <Input
                id="ec-certificate"
                name="certificate"
                type="file"
                accept="image/*,application/pdf"
              />
            </Field>
            <Field label={t.validFrom} htmlFor="ec-from" error={err("valid_from")}>
              <Input id="ec-from" name="valid_from" type="date" defaultValue={today} />
            </Field>
            <Field label={t.validTo} htmlFor="ec-to" error={err("valid_to")}>
              <Input id="ec-to" name="valid_to" type="date" />
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <SubmitButton>{t.add}</SubmitButton>
              {state.ok ? null : <FormMessage state={state} />}
            </div>
          </form>
        </LazyDetails>
      ) : null}
    </div>
  );
}
