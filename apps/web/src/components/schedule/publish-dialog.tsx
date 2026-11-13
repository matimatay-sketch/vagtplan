"use client";
import * as React from "react";
import { Loader2, OctagonAlert, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { previewPublishAction, publishAction, type PublishPreview } from "@/lib/actions/schedule";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export function PublishButton({
  departmentId,
  weekStart,
  pendingCount,
}: {
  departmentId: string;
  weekStart: string;
  pendingCount: number;
}) {
  const t = da.schedule;
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<PublishPreview | null>(null);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();
  const [publishing, startPublishing] = React.useTransition();

  const openDialog = () => {
    setOpen(true);
    setPreview(null);
    setReasons({});
    setError(null);
    startLoading(async () => setPreview(await previewPublishAction({ departmentId, weekStart })));
  };
  // "block" needs a reason; "allow" is always shown but permanently overridden by the settings.
  const blocking = preview?.violations.filter((v) => v.handling === "block") ?? [];
  const overridden =
    preview?.violations.filter((v) => v.handling === "allow" && v.severity === "BLOCKING") ?? [];
  const warnings =
    preview?.violations.filter((v) => v.handling === "allow" && v.severity === "WARNING") ?? [];
  const ready =
    preview &&
    preview.shiftCount > 0 &&
    (blocking.length === 0 ||
      (preview.canOverride && blocking.every((v) => (reasons[v.key] ?? "").trim().length >= 5)));

  const publish = () =>
    startPublishing(async () => {
      const r = await publishAction({ departmentId, weekStart, overrides: reasons });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
      } else setError(r.message ?? da.common.unknownError);
    });

  return (
    <>
      <Button
        variant="signal"
        onClick={openDialog}
        disabled={pendingCount === 0}
        data-testid="publish-button"
      >
        <Send /> {t.publish}
        {pendingCount ? (
          <span className="rounded-full bg-signal-foreground/15 px-1.5 text-xs tabular">
            {pendingCount}
          </span>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="publish-dialog">
          <DialogHeader>
            <DialogTitle>{t.publishTitle}</DialogTitle>
            <DialogDescription>
              {preview
                ? preview.shiftCount
                  ? t.publishLead(preview.shiftCount)
                  : t.nothingToPublish
                : da.common.loading}
            </DialogDescription>
          </DialogHeader>
          {loading || !preview ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4">
              {preview.violations.length === 0 ? (
                <p className="text-sm text-success">{t.noViolations}</p>
              ) : null}
              {blocking.length && !preview.canOverride ? (
                <Alert variant="destructive">
                  <AlertDescription>{t.overrideNotAllowed}</AlertDescription>
                </Alert>
              ) : null}
              {blocking.map((v) => (
                <div
                  key={v.key}
                  className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
                  data-testid="blocking-violation"
                >
                  <p className="flex items-start gap-2 text-sm">
                    <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>
                      <span className="font-medium">
                        {v.employeeName} · {formatDate(v.date)}
                      </span>
                      <br />
                      {v.message}
                      <span className="block text-xs text-muted-foreground">{v.source}</span>
                    </span>
                  </p>
                  {preview.canOverride ? (
                    <label className="grid gap-1 text-xs font-medium">
                      {t.overrideReason}
                      <Textarea
                        rows={2}
                        value={reasons[v.key] ?? ""}
                        onChange={(e) => setReasons((r) => ({ ...r, [v.key]: e.target.value }))}
                        aria-label={`${t.overrideReason} – ${v.employeeName} ${v.date}`}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
              {overridden.length ? (
                <ul
                  className="grid gap-1.5 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm"
                  data-testid="overridden-violations"
                >
                  <li className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t.permanentlyOverriddenTitle}
                  </li>
                  {overridden.map((v) => (
                    <li key={v.key} className="flex items-start gap-2">
                      <OctagonAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                      <span>
                        <span className="font-medium">
                          {v.employeeName} · {formatDate(v.date)}:
                        </span>{" "}
                        {v.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {warnings.length ? (
                <ul className="grid gap-1.5 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                  {warnings.map((v) => (
                    <li
                      key={v.key}
                      className="flex items-start gap-2"
                      data-testid="warning-violation"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                      <span>
                        <span className="font-medium">
                          {v.employeeName} · {formatDate(v.date)}:
                        </span>{" "}
                        {v.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {da.common.cancel}
                </Button>
                <Button
                  onClick={publish}
                  disabled={!ready || publishing}
                  data-testid="confirm-publish"
                >
                  {publishing ? <Loader2 className="animate-spin" /> : <Send />} {t.confirmPublish}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
