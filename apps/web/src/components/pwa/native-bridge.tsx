"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FirebaseMessaging,
  NativeApp,
  internalPath,
  isNativeApp,
  nativePlatform,
} from "@/lib/native";
import { registerPushDeviceAction } from "@/lib/actions/notifications";
import { da } from "@/lib/i18n/da";

/**
 * Only in the store app: a tap on a notification or a Turnus link opens the
 * page, Android's back button goes back, and the push token is kept current
 * once notifications are allowed.
 */
export function NativeBridge() {
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    const origin = window.location.origin;
    const open = (url?: string) => {
      const path = internalPath(url, origin);
      if (path) router.push(path);
    };
    const handles = [
      FirebaseMessaging.addListener("notificationActionPerformed", (e) =>
        open(e.notification.data?.url),
      ),
      NativeApp.addListener("appUrlOpen", (e) => open(e.url)),
      NativeApp.addListener("backButton", (e) => {
        if (e.canGoBack) window.history.back();
        else void NativeApp.exitApp();
      }),
    ];
    const platform = nativePlatform() === "ios" ? "ios" : "android";
    const register = (token: string) =>
      void registerPushDeviceAction({
        platform,
        token,
        label: da.notifications.platforms[platform]!,
      });
    // A token that changed (reinstall, restore) is registered again.
    handles.push(FirebaseMessaging.addListener("tokenReceived", (e) => register(e.token)));
    void FirebaseMessaging.checkPermissions()
      .then((p) => (p.receive === "granted" ? FirebaseMessaging.getToken() : null))
      .then((t) => t && register(t.token))
      .catch(() => {});
    return () => {
      for (const h of handles) void h.then((x) => x.remove());
    };
  }, [router]);
  return null;
}
