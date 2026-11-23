import { describe, expect, it } from "vitest";
import { pushNotification } from "./push-notification";

describe("pushNotification", () => {
  it("names the sender of a message, never the text, and opens the conversation", () => {
    const n = pushNotification("message", {
      conversation_id: "c1",
      message_kind: "text",
      sender: "Lise Leder",
    });
    expect(n).toEqual({
      title: "Ny besked fra Lise Leder",
      body: "Åbn Turnus for at læse den.",
      url: "/beskeder/c1",
      tag: "message-c1",
    });
  });

  it("uses fixed titles for swaps, afbud, reminders and system messages", () => {
    const k = (message_kind: string, sender: string | null = "Lise Leder") =>
      pushNotification("message", { conversation_id: "c1", message_kind, sender }).title;
    expect(k("swap")).toBe("Forslag om vagtbytte");
    expect(k("cancellation")).toBe("Afbud til en vagt");
    expect(k("reminder", null)).toBe("Påmindelse");
    expect(k("system", null)).toBe("Nyt om en vagt");
  });

  it("tells which days a published schedule changed, in Copenhagen dates", () => {
    // 22:30 UTC on 30 March is 00:30 on 31 March in Copenhagen (summer time).
    const one = pushNotification("schedule", {
      first_at: "2026-03-30T22:30:00Z",
      last_at: "2026-03-30T23:00:00Z",
    });
    expect(one.title).toBe("Din vagtplan er ændret");
    expect(one.body).toBe("Se dine vagter tirsdag 31. marts.");
    expect(one.url).toBe("/min-vagtplan");
    const span = pushNotification("schedule", {
      first_at: "2026-12-01T07:00:00Z",
      last_at: "2026-12-04T07:00:00Z",
    });
    expect(span.body).toBe("Se dine vagter 1.–4. december.");
    const months = pushNotification("schedule", {
      first_at: "2026-11-30T07:00:00Z",
      last_at: "2026-12-02T07:00:00Z",
    });
    expect(months.body).toBe("Se dine vagter 30. november–2. december.");
  });

  it("tells the employee the absence decision", () => {
    const yes = pushNotification("absence_decided", {
      absence_id: "a1",
      approved: true,
      type_code: "vacation",
      from_date: "2026-07-06",
      to_date: "2026-07-17",
    });
    expect(yes).toEqual({
      title: "Ferie godkendt",
      body: "6.–17. juli er godkendt.",
      url: "/fravaer",
      tag: "absence-a1",
    });
    const no = pushNotification("absence_decided", {
      absence_id: "a2",
      approved: false,
      type_code: "omsorg",
      from_date: "2026-07-06",
      to_date: "2026-07-06",
    });
    expect(no.title).toBe("Fravær afvist");
    expect(no.body).toBe("Mandag 6. juli er afvist. Se begrundelsen i Turnus.");
  });

  it("tells the approver about a new request", () => {
    const n = pushNotification("absence_requested", {
      absence_id: "a1",
      employee: "Mads Medarbejder",
      type_code: "extra",
      from_date: "2026-07-06",
      to_date: "2026-07-07",
    });
    expect(n.title).toBe("Mads Medarbejder har søgt feriefridag");
    expect(n.body).toBe("6.–7. juli. Tryk for at godkende eller afvise.");
    expect(n.url).toBe("/fravaer/godkend");
  });
});
