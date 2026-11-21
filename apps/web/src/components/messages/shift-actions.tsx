"use client";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { proposeSwapAction, reportCancellationAction } from "@/lib/actions/messages";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { shiftWhen } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";

export type Colleague = { employee_id: string; name: string };
export type ColleagueShift = {
  id: string;
  employee_id: string;
  start_at: string;
  end_at: string;
  department_id: string;
};

/** Field ids are unique per shift: the page has one dialog per shift. */
const fp = (shiftId: string, name: string, state: ActionState) => ({
  ...fieldProps(name, state),
  id: `${shiftId}-${name}`,
});

/** Runs a form action and closes the dialog when it succeeds. */
function useDialogAction(
  run: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  close: () => void,
) {
  return useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await run(prev, fd);
    if (r.ok) {
      close();
      if (r.message) toast.success(r.message);
    }
    return r;
  }, initialActionState);
}

export function SwapButton({
  shift,
  colleagues,
  colleagueShifts,
}: {
  shift: { id: string; start_at: string; end_at: string };
  colleagues: Colleague[];
  colleagueShifts: ColleagueShift[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useDialogAction(proposeSwapAction, () => setOpen(false));
  const [colleague, setColleague] = useState("");
  const t = da.swap;
  const theirs = colleagueShifts.filter((s) => s.employee_id === colleague);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" data-testid="swap-shift">
          <ArrowLeftRight /> {t.offer}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{shiftWhen(shift.start_at, shift.end_at)}</DialogDescription>
        </DialogHeader>
        {colleagues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noColleagues}</p>
        ) : (
          <form action={action} className="grid gap-4" noValidate>
            <input type="hidden" name="shift_id" value={shift.id} />
            <Field
              label={t.colleague}
              htmlFor={`${shift.id}-target_employee_id`}
              error={state.errors?.target_employee_id}
            >
              <NativeSelect
                {...fp(shift.id, "target_employee_id", state)}
                value={colleague}
                defaultValue={undefined}
                onChange={(e) => setColleague(e.target.value)}
              >
                <option value="">{t.chooseColleague}</option>
                {colleagues.map((c) => (
                  <option key={c.employee_id} value={c.employee_id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {colleague ? (
              <Field
                label={t.theirShift}
                htmlFor={`${shift.id}-target_shift_id`}
                help={t.theirShiftHelp}
              >
                <NativeSelect key={colleague} {...fp(shift.id, "target_shift_id", state)}>
                  <option value="">{t.giveAway}</option>
                  {theirs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {shiftWhen(s.start_at, s.end_at)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label={t.note} htmlFor={`${shift.id}-note`} error={state.errors?.note}>
              <Textarea rows={3} maxLength={1000} {...fp(shift.id, "note", state)} />
            </Field>
            <SubmitButton className="w-fit">{t.send}</SubmitButton>
            <FormMessage state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CancellationButton({
  shift,
}: {
  shift: { id: string; start_at: string; end_at: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useDialogAction(reportCancellationAction, () => setOpen(false));
  const t = da.cancellation;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" data-testid="report-cancellation">
          <CalendarX /> {t.report}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {shiftWhen(shift.start_at, shift.end_at)}. {t.help}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4" noValidate>
          <input type="hidden" name="shift_id" value={shift.id} />
          <Field label={t.reason} htmlFor={`${shift.id}-reason`} error={state.errors?.reason}>
            <Textarea rows={3} maxLength={1000} {...fp(shift.id, "reason", state)} />
          </Field>
          <SubmitButton className="w-fit">{t.send}</SubmitButton>
          <FormMessage state={state} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
