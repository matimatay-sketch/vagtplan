import { describe, expect, it } from "vitest";
import { isPhoneRequest } from "./device";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });

describe("isPhoneRequest", () => {
  it("trusts the mobile client hint", () => {
    expect(isPhoneRequest(h({ "sec-ch-ua-mobile": "?1" }))).toBe(true);
    expect(isPhoneRequest(h({ "sec-ch-ua-mobile": "?0", "user-agent": "Android Mobile" }))).toBe(
      false,
    );
  });

  it("falls back to the user agent: phones yes, tablets and desktops no", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";
    const pixel = "Mozilla/5.0 (Linux; Android 15; Pixel 7) Chrome/130.0 Mobile Safari/537.36";
    const tablet = "Mozilla/5.0 (Linux; Android 15; SM-X710) Chrome/130.0 Safari/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15";
    expect(isPhoneRequest(h({ "user-agent": iphone }))).toBe(true);
    expect(isPhoneRequest(h({ "user-agent": pixel }))).toBe(true);
    expect(isPhoneRequest(h({ "user-agent": tablet }))).toBe(false);
    expect(isPhoneRequest(h({ "user-agent": mac }))).toBe(false);
    expect(isPhoneRequest(h({}))).toBe(false);
  });
});
