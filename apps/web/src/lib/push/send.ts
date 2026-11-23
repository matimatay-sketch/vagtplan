import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";
import { pushNotification, type PushKind } from "@/lib/domain/push-notification";
import { fcmConfigured, sendFcm } from "./fcm";

/**
 * Push notifications: Web Push (browsers and the installed web app) with the
 * VAPID keys, and FCM for the store app. Without keys, nothing of that kind is
 * sent, and the notifications wait in the outbox.
 */
export function webPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function pushConfigured(): boolean {
  return webPushConfigured() || fcmConfigured();
}

type Device = {
  id: string;
  platform: "web" | "ios" | "android";
  token: string;
  keys: Record<string, string>;
};

async function sendWeb(d: Device, payload: string): Promise<"sent" | "gone" | "failed"> {
  // web-push encrypts and signs (VAPID); the request is sent with fetch.
  const req = webpush.generateRequestDetails(
    { endpoint: d.token, keys: { p256dh: d.keys.p256dh ?? "", auth: d.keys.auth ?? "" } },
    payload,
    {
      TTL: 24 * 3600,
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT ?? "mailto:no-reply@turnus.invalid",
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
      },
    },
  );
  const res = await fetch(req.endpoint, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.body ? new Uint8Array(req.body) : null,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return "sent";
  return res.status === 404 || res.status === 410 ? "gone" : "failed";
}

/**
 * Sends due push notifications from the outbox (claimed in the database, so
 * parallel senders never send the same one twice). A notification counts as
 * sent when it reached at least one device; devices the push service no longer
 * knows are archived.
 */
export async function dispatchPush(limit = 50): Promise<number> {
  if (!pushConfigured()) return 0;
  const db = createServiceClient();
  const { data, error } = await db.rpc("push_claim", { p_limit: limit });
  if (error || !data?.length) return 0;
  await Promise.all(
    data.map(async (row) => {
      const n = pushNotification(row.kind as PushKind, row.payload as Record<string, unknown>);
      const devices = (row.devices as unknown as Device[]) ?? [];
      const results = await Promise.all(
        devices.map(async (d) => {
          try {
            if (d.platform === "web")
              return webPushConfigured() ? sendWeb(d, JSON.stringify(n)) : "failed";
            return fcmConfigured() ? await sendFcm(d.token, n) : "failed";
          } catch {
            return "failed";
          }
        }),
      );
      const gone = devices.filter((_, i) => results[i] === "gone").map((d) => d.id);
      const ok = results.includes("sent") || (devices.length > 0 && gone.length === devices.length);
      await db.rpc("push_result", {
        p_id: row.id,
        p_ok: ok,
        p_error: ok ? "" : "no device reached",
        p_gone: gone,
      });
    }),
  );
  return data.length;
}

/** Sends pending push notifications after the response (the database fills the outbox). */
export function sendPushSoon() {
  after(async () => {
    try {
      await dispatchPush();
    } catch (e) {
      console.error("push", e);
    }
  });
}
