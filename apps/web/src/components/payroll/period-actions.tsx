"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
  templates: { id: string; name: string }[];
}) {
  const t = da.payroll;
  const [pending, start] = useTransition();
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
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
      {templates.length ? (
        <span className="flex items-center gap-2">
          <NativeSelect
            aria-label={t.exportWith}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
          <Button asChild variant="outline">
            <a href={`/lon/${periodId}/eksport?skabelon=${template}`} download>
              <Download /> {t.export}
            </a>
          </Button>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">{t.noTemplates}</span>
      )}
    </div>
  );
}
