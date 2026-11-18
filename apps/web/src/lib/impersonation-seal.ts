import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Seals the administrator's own refresh token while logged in as an employee
 * (AES-256-GCM, key derived from a server secret). Opened again on return.
 */
const keyOf = (secret: string) =>
  createHash("sha256").update(`turnus-impersonation:${secret}`).digest();

export function seal(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string, secret: string): string | null {
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
