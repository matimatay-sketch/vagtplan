"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Copy, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/help/help";
import { createCalendarFeedAction, endCalendarFeedAction } from "@/lib/actions/notifications";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

/**
 * The employee's shifts in the phone's own calendar: a secret link that is shown
 * once, when it is made. A new link replaces the old one.
 */
export function CalendarFeedCard({ activeSince }: { activeSince: string | null }) {
  const t = da.calendarFeed;
  const router = useRouter();
  const [busy, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);

  const create = () =>
    start(async () => {
      const r = await createCalendarFeedAction();
      if (r.ok && r.url) {
        setUrl(r.url);
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.message);
    });
  const stop = () => {
    if (!window.confirm(t.stopConfirm)) return;
    start(async () => {
      const r = await endCalendarFeedAction();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      setUrl(null);
      router.refresh();
    });
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.copied);
    } catch {
      // The field is selectable, so the link can still be copied by hand.
    }
  };

  return (
    <Card data-testid="calendar-feed">
      <CardHeader>
        <CardTitle>
          {t.title}
          <HelpTip>{t.help}</HelpTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {url ? (
          <div className="grid gap-2" data-testid="calendar-link">
            <label htmlFor="calendar-url" className="text-sm font-medium">
              {t.linkLabel}
            </label>
            <Input id="calendar-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            <p className="text-sm text-muted-foreground">{t.onlyOnce}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={url.replace(/^https?:/, "webcal:")}>
                  <CalendarPlus /> {t.open}
                </a>
              </Button>
              <Button variant="outline" onClick={copy}>
                <Copy /> {t.copy}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {activeSince ? t.active(formatDate(activeSince.slice(0, 10))) : t.none}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeSince ? "outline" : "default"}
            onClick={create}
            disabled={busy}
            data-testid="create-calendar-feed"
          >
            {activeSince ? <RefreshCw /> : <CalendarPlus />}
            {activeSince ? t.renew : t.create}
          </Button>
          {activeSince ? (
            <Button variant="ghost" className="text-destructive" onClick={stop} disabled={busy}>
              <Link2Off /> {t.stop}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
