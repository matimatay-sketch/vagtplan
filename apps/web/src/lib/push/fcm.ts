import "server-only";
import { createSign } from "node:crypto";

/**
 * Firebase Cloud Messaging (HTTP v1) for the store app on iOS and Android.
 * FCM_SERVICE_ACCOUNT holds the service account JSON of the Firebase project.
 */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function fcmConfigured(): boolean {
  return !!process.env.FCM_SERVICE_ACCOUNT;
}

let account: ServiceAccount | null = null;
let token: { value: string; expires: number } | null = null;

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<{ token: string; project: string }> {
  account ??= JSON.parse(process.env.FCM_SERVICE_ACCOUNT!) as ServiceAccount;
  if (token && token.expires > Date.now() + 60_000)
    return { token: token.value, project: account.project_id };
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`FCM token: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return { token: token.value, project: account.project_id };
}

export type FcmResult = "sent" | "gone" | "failed";

/** Sends one notification to one app installation. */
export async function sendFcm(
  deviceToken: string,
  n: { title: string; body: string; url: string; tag: string },
): Promise<FcmResult> {
  const { token: bearer, project } = await accessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title: n.title, body: n.body },
        data: { url: n.url, tag: n.tag },
        android: { notification: { tag: n.tag } },
        apns: { payload: { aps: { "thread-id": n.tag, sound: "default" } } },
      },
    }),
  });
  if (res.ok) return "sent";
  // The installation is gone (app removed or token replaced).
  if (res.status === 404 || res.status === 410) return "gone";
  const text = await res.text();
  return /UNREGISTERED|registration-token-not-registered/.test(text) ? "gone" : "failed";
}
