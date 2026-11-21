import { da } from "@/lib/i18n/da";

/** What the database puts in the e-mail outbox for a new message. */
export type MessageEmailPayload = {
  conversation_id: string;
  message_kind: "text" | "swap" | "cancellation" | "system";
  subject: string | null;
  sender: string | null;
  organization: string;
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The notification e-mail. It never contains the message itself, only who
 * wrote and a link, so private messages do not end up in mailboxes.
 */
export function messageEmail(
  p: MessageEmailPayload,
  siteUrl: string,
): { subject: string; text: string; html: string } {
  const t = da.messages.email;
  const subject =
    p.message_kind === "swap"
      ? t.subjectSwap
      : p.message_kind === "cancellation"
        ? t.subjectCancellation
        : p.message_kind === "system" || !p.sender
          ? t.subjectSystem
          : t.subjectText(p.sender);
  const url = `${siteUrl.replace(/\/$/, "")}/beskeder/${encodeURIComponent(p.conversation_id)}`;
  const lines = [
    t.intro(p.organization),
    p.sender ? t.from(p.sender) : null,
    p.subject ? t.about(p.subject) : null,
  ].filter((x): x is string => x !== null);
  const text = [...lines, "", `${t.open}: ${url}`, "", t.footer].join("\n");
  const html = [
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(url)}">${escapeHtml(t.open)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(t.footer)}</p>`,
  ].join("\n");
  return { subject, text, html };
}
