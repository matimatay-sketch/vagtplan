"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import { da } from "@/lib/i18n/da";

export type ExportTemplateOption = {
  id: string;
  name: string;
  content: "pay" | "absence" | "both";
  absenceUnit: "hours" | "days";
};

/**
 * "Eksportér fil": choose the pay period (unless given) and the export
 * template, then download the file.
 */
export function ExportDialog({
  periods,
  templates,
  defaultPeriodId,
}: {
  periods: { id: string; label: string }[];
  templates: ExportTemplateOption[];
  defaultPeriodId?: string;
}) {
  const t = da.payroll;
  const [period, setPeriod] = useState(defaultPeriodId ?? periods[0]?.id ?? "");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const chosen = templates.find((x) => x.id === template);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="export-file">
          <FileDown /> {t.exportFile}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>{t.exportFile}</DialogTitle>
          <DialogDescription>{t.exportFileLead}</DialogDescription>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-sm">
            {t.noTemplates}{" "}
            <Link href="/lon/skabeloner" className="text-primary underline underline-offset-4">
              {t.templates}
            </Link>
          </p>
        ) : (
          <div className="grid gap-4">
            {periods.length > 1 ? (
              <Field label={t.exportPeriod} htmlFor="export-period">
                <NativeSelect
                  id="export-period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label={t.exportWith} htmlFor="export-template">
              <NativeSelect
                id="export-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {chosen ? (
              <p className="text-sm text-muted-foreground" data-testid="export-content">
                {t.contents[chosen.content]}
                {chosen.content !== "pay"
                  ? ` · ${t.absenceUnit} ${t.absenceUnits[chosen.absenceUnit].toLowerCase()}`
                  : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild disabled={!period || !template}>
                <a href={`/lon/${period}/eksport?skabelon=${template}`} download>
                  <Download /> {t.downloadFile}
                </a>
              </Button>
              <Link
                href={`/lon/skabeloner?skabelon=${template}`}
                className="text-sm text-muted-foreground underline underline-offset-4"
              >
                {t.editTemplate}
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
