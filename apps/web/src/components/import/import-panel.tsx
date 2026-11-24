"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/help/help";
import { decodeCsvBytes, type ImportKind } from "@/lib/domain/csv-import";
import { MAX_IMPORT_BYTES } from "@/lib/import/kinds";
import { commitImportAction, previewImportAction, type ImportPreview } from "@/lib/actions/import";
import type { BalanceMode, PlannedRow } from "@/lib/import/plan";
import { da } from "@/lib/i18n/da";

const badge: Record<PlannedRow["action"], "success" | "secondary" | "outline" | "destructive"> = {
  create: "success",
  update: "secondary",
  skip: "outline",
  error: "destructive",
};

/**
 * One kind of import: template, file, check (a preview of every line) and then
 * the import itself. Nothing is saved before "Indlæs".
 */
export function ImportPanel({ kind }: { kind: ImportKind }) {
  const t = da.importCsv;
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<BalanceMode>("set");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [checking, startCheck] = useTransition();
  const [saving, startSave] = useTransition();

  const choose = async (file: File | undefined) => {
    setPreview(null);
    setFileError(null);
    setText(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setFileError(t.fileTooBig);
    setText(decodeCsvBytes(new Uint8Array(await file.arrayBuffer())));
  };
  const check = (m = mode) => {
    if (text === null) return setFileError(t.noFile);
    startCheck(async () => setPreview(await previewImportAction({ kind, text, balanceMode: m })));
  };
  const commit = () => {
    if (text === null) return;
    startSave(async () => {
      const r = await commitImportAction({ kind, text, balanceMode: mode });
      if (r.ok) {
        toast.success(r.message);
        setPreview(null);
        setText(null);
        router.refresh();
      } else toast.error(r.message);
    });
  };

  const plan = preview && !("error" in preview) ? preview : null;
  const counts = { create: 0, update: 0, skip: 0, error: 0 };
  for (const r of plan?.rows ?? []) counts[r.action]++;
  const rowProblems = plan?.problems.filter((p) => p.line > 1) ?? [];
  const fileProblems = plan?.problems.filter((p) => p.line <= 1) ?? [];
  counts.error += rowProblems.length;
  const blocked = !plan || plan.fatal || counts.error > 0;
  const toImport = counts.create + counts.update;
  // Errors first, then the file's order.
  const lines = [
    ...rowProblems.map((p) => ({
      line: p.line,
      action: "error" as const,
      summary: p.column ? da.importCsv.inColumn(p.column) : "",
      message: p.message,
    })),
    ...(plan?.rows ?? []),
  ].sort((a, b) =>
    (a.action === "error") !== (b.action === "error")
      ? a.action === "error"
        ? -1
        : 1
      : a.line - b.line,
  );

  return (
    <Card data-testid={`import-${kind}`}>
      <CardHeader>
        <CardTitle>
          {t.kinds[kind]}
          <HelpTip>
            <span className="grid gap-2">
              <span>{t.kindHelp[kind]}</span>
              <span>{t.fileHelp}</span>
            </span>
          </HelpTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" asChild>
            <a href={`/indlaes/skabelon/${kind}`} download>
              <Download /> {t.template}
            </a>
          </Button>
          <div className="grid gap-1.5">
            <label htmlFor={`import-file-${kind}`} className="text-sm font-medium">
              {t.file}
            </label>
            <input
              id={`import-file-${kind}`}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="block w-full max-w-sm cursor-pointer rounded-md border bg-card text-sm file:mr-3 file:min-h-9 file:cursor-pointer file:border-0 file:bg-secondary file:px-3 file:text-secondary-foreground pointer-coarse:file:min-h-11"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </div>
        </div>
        {kind === "balances" ? (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">{t.mode}</legend>
            {(["set", "adjust"] as const).map((m) => (
              <label
                key={m}
                className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name={`balance-mode-${kind}`}
                  className="size-4 accent-primary"
                  checked={mode === m}
                  onChange={() => {
                    setMode(m);
                    if (preview) check(m);
                  }}
                />
                {t.modes[m]}
              </label>
            ))}
          </fieldset>
        ) : null}
        {fileError ? (
          <p role="alert" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
        <div>
          <Button
            onClick={() => check()}
            disabled={checking || text === null}
            data-testid="import-check"
          >
            {checking ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
            {checking ? t.checking : t.check}
          </Button>
        </div>

        {preview && "error" in preview ? (
          <p role="alert" className="text-sm text-destructive">
            {preview.error}
          </p>
        ) : null}
        {plan ? (
          <section className="grid gap-3" aria-label={t.preview} data-testid="import-preview">
            <h3 className="font-semibold">{t.preview}</h3>
            <p className="text-sm" data-testid="import-counts">
              {t.counts(counts)}
            </p>
            {fileProblems.length ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                <p className="font-medium">{t.fileProblems}</p>
                <ul className="mt-1 list-disc pl-5">
                  {fileProblems.map((p) => (
                    <li key={p.message}>{p.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lines.length ? (
              <div
                className="max-h-[28rem] overflow-auto rounded-lg border"
                tabIndex={0}
                role="region"
                aria-label={t.preview}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t.line}</th>
                      <th className="px-3 py-2 font-medium">{t.action}</th>
                      <th className="px-3 py-2 font-medium">{t.what}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((r, i) => (
                      <tr
                        key={`${r.line}-${i}`}
                        className="border-t"
                        data-action={r.action}
                        data-line={r.line}
                      >
                        <td className="px-3 py-2 tabular">{r.line}</td>
                        <td className="px-3 py-2">
                          <Badge variant={badge[r.action]}>{t.actions[r.action]}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {r.summary ? <span>{r.summary}</span> : null}
                          {r.message ? (
                            <span
                              className={
                                r.action === "error"
                                  ? "block text-destructive"
                                  : "block text-muted-foreground"
                              }
                            >
                              {r.message}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {blocked ? (
              <p className="text-sm text-destructive">{t.fixFirst}</p>
            ) : toImport === 0 ? (
              <p className="text-sm text-muted-foreground">{t.nothingToDo}</p>
            ) : (
              <div>
                <Button onClick={commit} disabled={saving} data-testid="import-commit">
                  {saving ? <Loader2 className="animate-spin" /> : <Upload />}
                  {t.commit(toImport)}
                </Button>
              </div>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
