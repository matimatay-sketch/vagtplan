"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/help/help";
import {
  registerPushDeviceAction,
  removePushDeviceAction,
  saveNotificationSettingAction,
} from "@/lib/actions/notifications";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/forms/notifications";
import { FirebaseMessaging, isNativeApp, nativePlatform } from "@/lib/native";
import { deviceLabel, subscribeWebPush, webPushSupport } from "@/lib/push/web-subscribe";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export type PushDeviceRow = { id: string; platform: string; label: string; created_at: string };

type Status = "unknown" | "native" | "ok" | "unsupported" | "install-first" | "not-configured";

/**
 * Push notifications on Profil: turn them on for this phone or browser, choose
 * what to hear about, and turn them off on old devices.
 */
export function NotificationsCard({
  vapidKey,
  devices,
  settings,
  showApprovals,
}: {
  vapidKey: string | null;
  devices: PushDeviceRow[];
  settings: Record<NotificationKind, boolean>;
  showApprovals: boolean;
}) {
  const t = da.notifications;
  const router = useRouter();
  const [status, setStatus] = useState<Status>("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [on, setOn] = useState(settings);

  // What this device can do is only known in the browser.
  useEffect(() => {
    const support = webPushSupport();
    const next: Status = isNativeApp()
      ? "native"
      : support !== "ok"
        ? support
        : vapidKey
          ? "ok"
          : "not-configured";
    queueMicrotask(() => setStatus(next));
  }, [vapidKey]);

  const enable = () =>
    start(async () => {
      setMessage(null);
      try {
        let input: Parameters<typeof registerPushDeviceAction>[0] | null = null;
        if (status === "native") {
          const p = await FirebaseMessaging.requestPermissions();
          if (p.receive !== "granted") return setMessage(t.denied);
          const { token } = await FirebaseMessaging.getToken();
          input = { platform: nativePlatform() === "ios" ? "ios" : "android", token, label: "" };
          input.label = t.platforms[input.platform]!;
        } else if (vapidKey) {
          const sub = await subscribeWebPush(vapidKey);
          if (!sub) return setMessage(t.denied);
          input = { platform: "web", token: sub.endpoint, keys: sub.keys, label: deviceLabel() };
        }
        if (!input) return;
        const r = await registerPushDeviceAction(input);
        if (r.ok) {
          toast.success(r.message);
          router.refresh();
        } else setMessage(r.message ?? t.failed);
      } catch {
        setMessage(t.failed);
      }
    });

  const toggle = (kind: NotificationKind, value: boolean) => {
    setOn((s) => ({ ...s, [kind]: value }));
    start(async () => {
      const r = await saveNotificationSettingAction(kind, value);
      if (!r.ok) {
        setOn((s) => ({ ...s, [kind]: !value }));
        toast.error(r.message);
      }
    });
  };

  const remove = (d: PushDeviceRow) =>
    start(async () => {
      const r = await removePushDeviceAction(d.id);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      router.refresh();
    });

  const canEnable = status === "native" || status === "ok";
  const hint =
    status === "install-first"
      ? t.installFirst
      : status === "unsupported"
        ? t.unsupported
        : status === "not-configured"
          ? t.notConfigured
          : null;

  return (
    <Card data-testid="notifications">
      <CardHeader>
        <CardTitle>
          {t.title}
          <HelpTip>{t.help}</HelpTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          {canEnable ? (
            <div>
              <Button onClick={enable} disabled={busy} data-testid="enable-push">
                <Bell /> {t.enableHere}
              </Button>
            </div>
          ) : null}
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
          {message ? (
            <p role="status" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
        </div>

        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t.kindsTitle}</legend>
          {NOTIFICATION_KINDS.filter((k) => k !== "approvals" || showApprovals).map((k) => (
            <label
              key={k}
              className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
            >
              <Checkbox
                checked={on[k]}
                disabled={busy}
                onChange={(e) => toggle(k, e.target.checked)}
                data-kind={k}
              />
              {t.kinds[k]}
            </label>
          ))}
        </fieldset>

        <section className="grid gap-2">
          <h3 className="text-sm font-medium">{t.devices}</h3>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noDevices}</p>
          ) : (
            <ul className="grid divide-y rounded-lg border" data-testid="push-devices">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {d.label || t.platforms[d.platform]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.platforms[d.platform]} · {t.since(formatDate(d.created_at.slice(0, 10)))}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={t.removeLabel(d.label || t.platforms[d.platform]!)}
                    onClick={() => remove(d)}
                  >
                    <BellOff /> {t.remove}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
