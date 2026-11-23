import { describe, expect, it } from "vitest";
import { notificationSettingSchema, pushDeviceSchema, pushDeviceSchemaFor } from "./notifications";

describe("pushDeviceSchema", () => {
  it("a browser needs its endpoint (https) and both keys", () => {
    const ok = {
      platform: "web",
      token: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "BOrk", auth: "a1b2" },
      label: "Chrome på Android",
    };
    expect(pushDeviceSchema.parse(ok)).toEqual(ok);
    expect(pushDeviceSchema.safeParse({ ...ok, keys: { p256dh: "BOrk" } }).success).toBe(false);
    expect(pushDeviceSchema.safeParse({ ...ok, token: "ftp://x.example/abcdefgh" }).success).toBe(
      false,
    );
  });

  it("plain http only to the local test receiver, and only when allowed", () => {
    const local = {
      platform: "web",
      token: "http://127.0.0.1:4545/__push/x",
      keys: { p256dh: "a", auth: "b" },
    };
    expect(pushDeviceSchema.safeParse(local).success).toBe(false);
    expect(pushDeviceSchemaFor(true).safeParse(local).success).toBe(true);
    expect(
      pushDeviceSchemaFor(true).safeParse({ ...local, token: "http://10.0.0.1/__push/x" }).success,
    ).toBe(false);
  });

  it("the store app sends an FCM token and no keys", () => {
    expect(
      pushDeviceSchema.parse({ platform: "ios", token: "fcm:token-123456", label: "" }),
    ).toEqual({ platform: "ios", token: "fcm:token-123456", keys: {}, label: "" });
    expect(pushDeviceSchema.safeParse({ platform: "ios", token: "short" }).success).toBe(false);
    expect(pushDeviceSchema.safeParse({ platform: "windows", token: "x".repeat(20) }).success).toBe(
      false,
    );
  });
});

describe("notificationSettingSchema", () => {
  it("one kind turned on or off", () => {
    expect(notificationSettingSchema.parse({ kind: "schedule", on: false })).toEqual({
      kind: "schedule",
      on: false,
    });
    expect(notificationSettingSchema.safeParse({ kind: "pay", on: true }).success).toBe(false);
  });
});
