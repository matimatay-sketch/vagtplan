import { z } from "zod";

/**
 * A phone or browser that wants push notifications. The server posts to a Web
 * Push endpoint, so only https is allowed (plain http to 127.0.0.1 only for the
 * local test receiver, when insecure endpoints are allowed).
 */
export const pushDeviceSchemaFor = (allowInsecure: boolean) =>
  z
    .object({
      platform: z.enum(["web", "ios", "android"]),
      token: z.string().min(10).max(4096),
      keys: z
        .object({ p256dh: z.string().min(1), auth: z.string().min(1) })
        .partial()
        .default({}),
      label: z.string().max(120).default(""),
    })
    .superRefine((d, ctx) => {
      if (d.platform !== "web") return;
      // Web Push: the endpoint is an https URL at the browser's push service.
      const local = allowInsecure && /^http:\/\/127\.0\.0\.1[:/]/.test(d.token);
      if (!/^https:\/\//.test(d.token) && !local)
        ctx.addIssue({ code: "custom", path: ["token"], message: "endpoint" });
      if (!d.keys.p256dh || !d.keys.auth)
        ctx.addIssue({ code: "custom", path: ["keys"], message: "keys" });
    });
export const pushDeviceSchema = pushDeviceSchemaFor(false);
export type PushDeviceInput = z.input<typeof pushDeviceSchema>;

export const NOTIFICATION_KINDS = ["messages", "schedule", "absence", "approvals"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationSettingSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  on: z.boolean(),
});
