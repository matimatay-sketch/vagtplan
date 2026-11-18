import { createHash, createHmac, randomBytes } from "node:crypto";

/** A new API key. The key is shown once; only the hash is stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `tk_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 11), hash: hashApiKey(key) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const generateWebhookSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/** Turnus-Signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">. */
export function signWebhook(secret: string, body: string, unixSeconds: number): string {
  const mac = createHmac("sha256", secret).update(`${unixSeconds}.${body}`).digest("hex");
  return `t=${unixSeconds},v1=${mac}`;
}
