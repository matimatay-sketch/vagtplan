"use client";

/** The VAPID public key (base64url) as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type WebPushSupport = "ok" | "unsupported" | "install-first";

/** Can this browser get Web Push? iPhones only can from the app on the home screen. */
export function webPushSupport(): WebPushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return ios && !standalone ? "install-first" : "unsupported";
  return "ok";
}

/** Asks for permission and subscribes this browser; null when the user said no. */
export async function subscribeWebPush(
  vapidPublicKey: string,
): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  // Development builds register the worker without its offline cache.
  const reg =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register(
      process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1",
      { scope: "/", updateViaCache: "none" },
    ));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(vapidPublicKey),
    }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** A short name for this device, so the user can tell their devices apart. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Computer";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return browser ? `${browser} på ${os}` : os;
}
