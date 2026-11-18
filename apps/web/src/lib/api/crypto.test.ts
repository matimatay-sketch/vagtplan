import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, signWebhook } from "./crypto";

describe("API keys", () => {
  it("are random, start with tk_, and only the hash is kept", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^tk_[A-Za-z0-9_-]{40,}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 11));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(a.key)).toBe(a.hash);
  });
});

describe("webhook signatures", () => {
  it("sign timestamp.body with HMAC-SHA256 (Turnus-Signature: t=…,v1=…)", () => {
    const body = '{"event":"ping"}';
    const header = signWebhook("hemmelig", body, 1_700_000_000);
    const expected = createHmac("sha256", "hemmelig").update(`1700000000.${body}`).digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });
});
