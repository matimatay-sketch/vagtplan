import { describe, expect, it } from "vitest";
import { calendarFeed } from "./calendar-feed";

const now = new Date("2026-11-23T10:00:00Z");

describe("calendarFeed", () => {
  it("is an iCalendar with one event per published shift, in UTC, with CRLF lines", () => {
    const ics = calendarFeed(
      [
        {
          id: "s1",
          start_at: "2026-12-01T07:00:00+00:00",
          end_at: "2026-12-01T15:00:00+00:00",
          label: null,
          kind: "work",
          department: "Butik",
        },
      ],
      { name: "Turnus – Mads", now },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Turnus – Mads\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(ics).toContain(
      [
        "BEGIN:VEVENT",
        "UID:s1@turnus",
        "DTSTAMP:20261123T100000Z",
        "DTSTART:20261201T070000Z",
        "DTEND:20261201T150000Z",
        "SUMMARY:Vagt · Butik",
        "LOCATION:Butik",
        "END:VEVENT",
      ].join("\r\n"),
    );
  });

  it("keeps the exact instant across summer time (the phone shows local time)", () => {
    // 06:00 UTC on 29 March is 08:00 in Copenhagen (after the change to summer time).
    const ics = calendarFeed(
      [
        {
          id: "s2",
          start_at: "2026-03-29T06:00:00Z",
          end_at: "2026-03-29T14:00:00Z",
          label: null,
          kind: "work",
          department: "Butik",
        },
      ],
      { name: "x", now },
    );
    expect(ics).toContain("DTSTART:20260329T060000Z");
  });

  it("names on-call shifts and labels, and escapes text", () => {
    const ics = calendarFeed(
      [
        {
          id: "s3",
          start_at: "2026-12-02T16:00:00Z",
          end_at: "2026-12-03T06:00:00Z",
          label: "Lukker, kasse; vagt",
          kind: "on_call",
          department: "Café",
        },
      ],
      { name: "x", now },
    );
    expect(ics).toContain("SUMMARY:Tilkald · Lukker\\, kasse\\; vagt\r\n");
  });

  it("folds lines longer than 75 octets", () => {
    const label = "Meget lang betegnelse ".repeat(6).trim();
    const ics = calendarFeed(
      [
        {
          id: "s4",
          start_at: "2026-12-02T16:00:00Z",
          end_at: "2026-12-02T18:00:00Z",
          label,
          kind: "work",
          department: "Butik",
        },
      ],
      { name: "x", now },
    );
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolded, the text is whole again.
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:Vagt · ${label}`);
  });
});
