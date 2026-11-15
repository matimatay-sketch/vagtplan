"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import { saveTemplateAction } from "@/lib/actions/payroll";
import {
  EXPORT_FIELDS,
  GENERIC_CSV,
  exportSettingsSchema,
  renderExport,
  type ExportRow,
  type ExportSettings,
} from "@/lib/domain/export";
import { da } from "@/lib/i18n/da";

const SAMPLE: ExportRow[] = [
  {
    employeeNumber: "1002",
    employeeName: "Mads Medarbejder",
    payCode: "NORMAL",
    label: "Normaltimer",
    unit: "hours",
    quantityMinutes: 4440,
    rateOre: 15000,
    amountOre: 1110000,
    periodStart: "2027-01-04",
    periodEnd: "2027-01-17",
  },
  {
    employeeNumber: "1002",
    employeeName: "Mads Medarbejder",
    payCode: "AFTEN",
    label: "Aftentillæg",
    unit: "hours",
    quantityMinutes: 270,
    rateOre: 2500,
    amountOre: 11250,
    periodStart: "2027-01-04",
    periodEnd: "2027-01-17",
  },
];

/** Builds an export template: format, columns and pay code mapping, with a live preview. */
export function TemplateEditor({
  id,
  name: initialName,
  settings: initial,
  payCodes,
}: {
  id: string | null;
  name: string;
  settings: ExportSettings | null;
  /** Pay codes in use in the organization's agreements and supplements. */
  payCodes: { code: string; label: string }[];
}) {
  const t = da.payroll;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [s, setS] = useState<ExportSettings>(initial ?? GENERIC_CSV);
  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) =>
    setS((x) => ({ ...x, [k]: v }));
  const parsed = exportSettingsSchema.safeParse(s);
  const preview = parsed.success
    ? renderExport(parsed.data, SAMPLE).text.replace(/^\uFEFF/, "")
    : "";

  const updateColumn = (i: number, patch: Partial<ExportSettings["columns"][number]>) =>
    set(
      "columns",
      s.columns.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    );

  const save = () =>
    start(async () => {
      const r = await saveTemplateAction({ id, name, settings: s });
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok && r.id && !id) router.push(`/lon/skabeloner?skabelon=${r.id}`);
      else router.refresh();
    });

  return (
    <div className="grid gap-6" data-testid="template-editor">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.templateName} htmlFor="template-name">
          <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.separator} htmlFor="separator">
          <NativeSelect
            id="separator"
            value={s.separator}
            onChange={(e) => set("separator", e.target.value)}
          >
            <option value=";">{t.separators[";"]}</option>
            <option value=",">{t.separators[","]}</option>
            <option value={"\t"}>{t.separators["\t"]}</option>
          </NativeSelect>
        </Field>
        <Field label={t.decimal} htmlFor="decimal">
          <NativeSelect
            id="decimal"
            value={s.decimal}
            onChange={(e) => set("decimal", e.target.value as ExportSettings["decimal"])}
          >
            <option value=",">,</option>
            <option value=".">.</option>
          </NativeSelect>
        </Field>
        <Field label={t.dateFormat} htmlFor="dateFormat">
          <NativeSelect
            id="dateFormat"
            value={s.dateFormat}
            onChange={(e) => set("dateFormat", e.target.value as ExportSettings["dateFormat"])}
          >
            {(["yyyy-mm-dd", "dd-mm-yyyy", "dd.mm.yyyy", "ddmmyyyy"] as const).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.grouping} htmlFor="grouping">
          <NativeSelect
            id="grouping"
            value={s.grouping}
            onChange={(e) => set("grouping", e.target.value as ExportSettings["grouping"])}
          >
            <option value="employee_code">{t.groupings.employee_code}</option>
            <option value="line">{t.groupings.line}</option>
          </NativeSelect>
        </Field>
        <Field label={t.lineEnding} htmlFor="lineEnding">
          <NativeSelect
            id="lineEnding"
            value={s.lineEnding}
            onChange={(e) => set("lineEnding", e.target.value as ExportSettings["lineEnding"])}
          >
            <option value="crlf">Windows (CRLF)</option>
            <option value="lf">Unix (LF)</option>
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={s.header}
            onChange={(e) => set("header", e.target.checked)}
          />
          {t.header}
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={s.bom}
            onChange={(e) => set("bom", e.target.checked)}
          />
          {t.bom}
        </label>
      </div>

      <fieldset className="grid gap-2" data-testid="template-columns">
        <legend className="mb-1 text-sm font-medium">{t.columns}</legend>
        {s.columns.map((c, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2"
            data-testid="template-column"
          >
            <NativeSelect
              aria-label={`${t.column} ${i + 1}`}
              value={c.field}
              onChange={(e) =>
                updateColumn(i, { field: e.target.value as (typeof EXPORT_FIELDS)[number] })
              }
            >
              {EXPORT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t.fields[f]}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label={`${c.field === "constant" ? t.constant : t.columnHeader} ${i + 1}`}
              placeholder={c.field === "constant" ? t.constant : t.columnHeader}
              value={c.field === "constant" ? (c.value ?? "") : c.header}
              onChange={(e) =>
                updateColumn(
                  i,
                  c.field === "constant" ? { value: e.target.value } : { header: e.target.value },
                )
              }
            />
            {c.field === "posting" ? (
              <Input
                aria-label={`${t.dimensionKey} ${i + 1}`}
                placeholder={t.dimensionKey}
                className="w-48 font-mono"
                value={c.dimension ?? ""}
                onChange={(e) => updateColumn(i, { dimension: e.target.value.trim() })}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.moveUp}
              disabled={i === 0}
              onClick={() => {
                const next = [...s.columns];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                set("columns", next);
              }}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.removeColumn}
              onClick={() =>
                set(
                  "columns",
                  s.columns.filter((_, k) => k !== i),
                )
              }
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => set("columns", [...s.columns, { field: "pay_code_external", header: "" }])}
        >
          <Plus /> {t.addColumn}
        </Button>
      </fieldset>

      <fieldset className="grid gap-2" data-testid="template-codes">
        <legend className="mb-1 text-sm font-medium">{t.codeMap}</legend>
        <p className="text-xs text-muted-foreground">{t.codeMapLead}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {payCodes.map((p) => {
            const has = Object.prototype.hasOwnProperty.call(s.codeMap, p.code);
            const v = s.codeMap[p.code];
            return (
              <div key={p.code} className="flex items-center gap-2 text-sm">
                <span className="w-40 truncate" title={p.label}>
                  <span className="font-mono text-xs">{p.code}</span>{" "}
                  <span className="text-muted-foreground">{p.label}</span>
                </span>
                <Input
                  className="h-8 flex-1"
                  aria-label={`${t.codeMap}: ${p.code}`}
                  value={has && v !== null ? (v ?? "") : ""}
                  disabled={has && v === null}
                  onChange={(e) => {
                    const next = { ...s.codeMap };
                    if (e.target.value) next[p.code] = e.target.value;
                    else delete next[p.code];
                    set("codeMap", next);
                  }}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={has && v === null}
                    onChange={(e) => {
                      const next = { ...s.codeMap };
                      if (e.target.checked) next[p.code] = null;
                      else delete next[p.code];
                      set("codeMap", next);
                    }}
                  />
                  {t.exclude}
                </label>
              </div>
            );
          })}
        </div>
        <Field label={t.unmapped} htmlFor="unmapped" className="max-w-xs">
          <NativeSelect
            id="unmapped"
            value={s.unmapped}
            onChange={(e) => set("unmapped", e.target.value as ExportSettings["unmapped"])}
          >
            <option value="keep">{t.unmappedOptions.keep}</option>
            <option value="skip">{t.unmappedOptions.skip}</option>
          </NativeSelect>
        </Field>
      </fieldset>

      <div className="grid gap-2">
        <div className="text-sm font-medium">{t.preview}</div>
        <pre
          className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre"
          data-testid="template-preview"
        >
          {parsed.success ? preview.replaceAll("\t", "→") : parsed.error.issues[0]?.message}
        </pre>
      </div>
      <div>
        <Button onClick={save} disabled={pending || !parsed.success || !name.trim()}>
          {t.saveTemplate}
        </Button>
      </div>
    </div>
  );
}
