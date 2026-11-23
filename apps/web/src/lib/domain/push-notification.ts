import { da } from "@/lib/i18n/da";

/** What the database puts in the push outbox, by kind. */
export type PushKind = "message" | "schedule" | "absence_decided" | "absence_requested";
export type PushPayload = Record<string, unknown>;

/** The notification shown on the phone: the title, a short text, where a tap goes. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

const TZ = "Europe/Copenhagen";
const part = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("da-DK", { timeZone: TZ, ...o }).format(d);
// da-DK writes the day with its period ("31.").
const day = (d: Date) => part(d, { day: "numeric" }).replace(/\.?$/, ".");
const dayMonth = (d: Date) => `${day(d)} ${part(d, { month: "long" })}`;
const sameDay = (a: Date, b: Date) =>
  part(a, { year: "numeric", month: "numeric", day: "numeric" }) ===
  part(b, { year: "numeric", month: "numeric", day: "numeric" });

/** "tirsdag 31. marts", "1.–4. december" or "30. november–2. december" (Copenhagen dates). */
export function daySpan(first: Date, last: Date): string {
  if (sameDay(first, last)) return `${part(first, { weekday: "long" })} ${dayMonth(first)}`;
  if (part(first, { month: "numeric" }) === part(last, { month: "numeric" }))
    return `${day(first)}–${dayMonth(last)}`;
  return `${dayMonth(first)}–${dayMonth(last)}`;
}

// Calendar dates are noon UTC, which is the same date in Copenhagen.
const civil = (d: unknown) => new Date(`${String(d)}T12:00:00Z`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The text of a push notification. It never holds the message text itself. */
export function pushNotification(kind: PushKind, p: PushPayload): PushMessage {
  const t = da.push;
  switch (kind) {
    case "message": {
      const id = str(p.conversation_id);
      const sender = str(p.sender);
      const title =
        p.message_kind === "swap"
          ? t.swap
          : p.message_kind === "cancellation"
            ? t.cancellation
            : p.message_kind === "reminder"
              ? t.reminder
              : p.message_kind === "system" || !sender
                ? t.system
                : t.messageFrom(sender);
      return { title, body: t.messageBody, url: `/beskeder/${id}`, tag: `message-${id}` };
    }
    case "schedule":
      return {
        title: t.scheduleTitle,
        body: t.scheduleBody(daySpan(new Date(str(p.first_at)), new Date(str(p.last_at)))),
        url: "/min-vagtplan",
        tag: "schedule",
      };
    case "absence_decided": {
      const type = t.absenceTypes[str(p.type_code)] ?? t.absenceOther;
      const days = capitalize(daySpan(civil(p.from_date), civil(p.to_date)));
      return {
        title: p.approved ? t.absenceApproved(type) : t.absenceRejected(type),
        body: p.approved ? t.approvedBody(days) : t.rejectedBody(days),
        url: "/fravaer",
        tag: `absence-${str(p.absence_id)}`,
      };
    }
    case "absence_requested": {
      const type = (t.absenceTypes[str(p.type_code)] ?? t.absenceOther).toLowerCase();
      return {
        title: t.requestedTitle(str(p.employee), type),
        body: t.requestedBody(daySpan(civil(p.from_date), civil(p.to_date))),
        url: "/fravaer/godkend",
        tag: `absence-${str(p.absence_id)}`,
      };
    }
  }
}
