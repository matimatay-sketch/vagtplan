import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The store app shows Turnus from the server (TURNUS_APP_URL, e.g.
 * https://app.turnus.dk), so every update of the web app reaches the app at
 * once. The native part adds push notifications (Firebase Cloud Messaging on
 * both platforms), the back button, the splash screen and an offline page.
 */
const url = process.env.TURNUS_APP_URL ?? "https://app.turnus.dk";

const config: CapacitorConfig = {
  appId: process.env.TURNUS_APP_ID ?? "dk.turnus.app",
  appName: "Turnus",
  webDir: "www",
  server: {
    url,
    // Shown when the server cannot be reached (no network).
    errorPath: "offline.html",
    allowNavigation: [new URL(url).host],
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "always", limitsNavigationsToAppBoundDomains: true },
  // Avoids a Swift package name clash in the Firebase plugin (needs Capacitor CLI 8.4+).
  experimental: {
    ios: { spm: { packageOptions: { "@capacitor-firebase/messaging": { symlink: true } } } },
  },
  plugins: {
    FirebaseMessaging: { presentationOptions: ["badge", "sound", "alert"] },
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#f2f5f4", showSpinner: false },
    StatusBar: { style: "LIGHT", backgroundColor: "#f2f5f4" },
  },
};

export default config;
