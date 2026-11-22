"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportDialog, type ExportTemplateOption } from "./export-dialog";
import { calculatePeriodAction, closePeriodAction } from "@/lib/actions/payroll";
import { da } from "@/lib/i18n/da";

export function PeriodActions({
  periodId,
  open,
  canManage,
  templates,
}: {
  periodId: string;
  open: boolean;
  canManage: boolean;
  templates: ExportTemplateOption[];
}) {
  const t = da.payroll;
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="period-actions">
      {open ? (
        <>
          <Button disabled={pending} onClick={() => run(() => calculatePeriodAction(periodId))}>
            <Calculator /> {t.calculate}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t.closeConfirm)) run(() => closePeriodAction(periodId));
            }}
          >
            <Lock /> {t.close}
          </Button>
        </>
      ) : null}
      <ExportDialog
        periods={[{ id: periodId, label: "" }]}
        defaultPeriodId={periodId}
        templates={templates}
      />
    </div>
  );
}
