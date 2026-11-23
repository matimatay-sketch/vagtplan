import "server-only";
import { after } from "next/server";
import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { messageEmail, type MessageEmailPayload } from "@/lib/domain/message-email";
import { dispatchPush } from "@/lib/push/send";

/** E-mail is sent when SMTP_URL is set (e.g. smtps://user:pass@smtp.example.eu:465). */
export function emailConfigured(): boolean {
  return !!process.env.SMTP_URL;
}

let transport: nodemailer.Transporter | null = null;
function mailer() {
  transport ??= nodemailer.createTransport(process.env.SMTP_URL!);
  return transport;
}

/**
 * Sends due notification e-mails from the outbox (claimed in the database, so
 * parallel senders never send the same one twice). Without SMTP_URL nothing is
 * claimed and the e-mails wait.
 */
export async function dispatchEmails(limit = 20): Promise<number> {
  if (!emailConfigured()) return 0;
  const db = createServiceClient();
  const { data, error } = await db.rpc("email_claim", { p_limit: limit });
  if (error || !data?.length) return 0;
  const from = process.env.EMAIL_FROM ?? "Turnus <no-reply@turnus.invalid>";
  await Promise.all(
    data.map(async (d) => {
      try {
        const m = messageEmail(d.payload as unknown as MessageEmailPayload, env.siteUrl);
        await mailer().sendMail({
          from,
          to: d.email,
          subject: m.subject,
          text: m.text,
          html: m.html,
        });
        await db.rpc("email_result", { p_id: d.id, p_ok: true, p_error: "" });
      } catch (e) {
        await db.rpc("email_result", {
          p_id: d.id,
          p_ok: false,
          p_error: e instanceof Error ? e.message : "send failed",
        });
      }
    }),
  );
  return data.length;
}

/** Sends pending e-mails and push notifications after the response (the database fills the outboxes). */
export function sendEmailsSoon() {
  after(async () => {
    try {
      await Promise.all([dispatchEmails(), dispatchPush()]);
    } catch (e) {
      console.error("notifications", e);
    }
  });
}
