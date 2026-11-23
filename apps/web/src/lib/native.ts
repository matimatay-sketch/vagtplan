"use client";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The store app (Capacitor) loads Turnus from the server and injects its native
 * bridge. The plugins are reached through registerPlugin, so the browser
 * bundle holds no native code; in a browser these are never called.
 */
export const isNativeApp = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform() as "ios" | "android" | "web";

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";
interface FirebaseMessagingPlugin {
  checkPermissions(): Promise<{ receive: Permission }>;
  requestPermissions(): Promise<{ receive: Permission }>;
  getToken(): Promise<{ token: string }>;
  addListener(
    event: "notificationActionPerformed",
    cb: (e: { notification: { data?: { url?: string } } }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "tokenReceived",
    cb: (e: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
}
export const FirebaseMessaging = registerPlugin<FirebaseMessagingPlugin>("FirebaseMessaging");

interface AppPlugin {
  addListener(event: "appUrlOpen", cb: (e: { url: string }) => void): Promise<PluginListenerHandle>;
  addListener(
    event: "backButton",
    cb: (e: { canGoBack: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  exitApp(): Promise<void>;
}
export const NativeApp = registerPlugin<AppPlugin>("App");

/** A path inside Turnus from a notification or a universal link (never another site). */
export function internalPath(url: string | undefined, origin: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}
