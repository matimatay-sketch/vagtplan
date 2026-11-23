import { da } from "@/lib/i18n/da";

/** A published shift as the calendar shows it. */
export type CalendarShift = {
  id: string;
  start_at: string;
  end_at: string;
  label: string | null;
  kind: string;
  department: string | null;
};

/** 20261201T070000Z: times are UTC, and the phone shows them in its own time zone. */
const stamp = (iso: string | Date) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const escape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets (RFC 5545 §3.1), never inside a character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Continuation lines start with a space, which counts.
    const limit = out.length === 0 ? 75 : 74;
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** The employee's published shifts as an iCalendar feed (for the phone's calendar). */
export function calendarFeed(
  shifts: readonly CalendarShift[],
  opts: { name: string; now: Date },
): string {
  const t = da.calendar;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turnus//Vagtplan//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(opts.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const s of shifts) {
    const what = s.kind === "on_call" ? t.onCall : t.shift;
    const detail = s.label?.trim() || s.department || "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@turnus`,
      `DTSTAMP:${stamp(opts.now)}`,
      `DTSTART:${stamp(s.start_at)}`,
      `DTEND:${stamp(s.end_at)}`,
      `SUMMARY:${escape(detail ? `${what} · ${detail}` : what)}`,
      ...(s.department ? [`LOCATION:${escape(s.department)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
