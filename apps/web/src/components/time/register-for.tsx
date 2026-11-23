"use client";
import { useCallback, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import type { PostingDimension } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";
import type { DeviationContext } from "@/lib/time/deviation-types";
import { EntryDialog, type EntryDraft, type EntrySupplements } from "./entry-dialog";

/**
 * A manager registers time for any employee they manage, also without a
 * planned shift: choose the employee and the date, then fill in the times.
 */
export function RegisterForEmployee({
  employees,
  defaultDate,
  posting,
  supplements,
  deviation,
}: {
  employees: { id: string; name: string; departmentId: string }[];
  defaultDate: string;
  posting: PostingDimension[];
  supplements: EntrySupplements;
  /** Deviation reasons for the registration form. */
  deviation?: DeviationContext;
}) {
  const t = da.time;
  const [choosing, setChoosing] = useState(false);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const close = useCallback(() => setDraft(null), []);
  if (employees.length === 0) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setChoosing(true)} data-testid="register-for">
        <UserPlus /> {t.registerForEmployee}
      </Button>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="max-w-md" data-testid="register-for-dialog">
          <DialogHeader>
            <DialogTitle>{t.registerForEmployee}</DialogTitle>
            <DialogDescription>{t.registerForLead}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t.employee} htmlFor="register-employee">
              <NativeSelect
                id="register-employee"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={da.schedule.date} htmlFor="register-date">
              <Input
                id="register-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <div>
              <Button
                disabled={!employeeId || !date}
                onClick={() => {
                  const e = employees.find((x) => x.id === employeeId)!;
                  setChoosing(false);
                  setDraft({
                    mode: "create",
                    employeeId: e.id,
                    departmentId: e.departmentId,
                    date,
                    employeeName: e.name,
                  });
                }}
              >
                {t.continue}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <EntryDialog
        draft={draft}
        posting={posting}
        supplements={supplements}
        deviation={deviation}
        onClose={close}
      />
    </>
  );
}
