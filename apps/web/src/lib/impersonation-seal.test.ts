import { describe, expect, it } from "vitest";
import { seal, unseal } from "./impersonation-seal";

describe("seal", () => {
  it("round-trips, and fails with another secret or a tampered value", () => {
    const s = seal("refresh-token-123", "secret-a");
    expect(s).not.toContain("refresh-token-123");
    expect(unseal(s, "secret-a")).toBe("refresh-token-123");
    expect(unseal(s, "secret-b")).toBeNull();
    const [iv, tag, data] = s.split(".");
    expect(unseal([iv, tag, `${data}x`].join("."), "secret-a")).toBeNull();
    expect(unseal("garbage", "secret-a")).toBeNull();
  });
});
