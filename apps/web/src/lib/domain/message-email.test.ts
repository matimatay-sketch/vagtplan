import { describe, expect, it } from "vitest";
import { messageEmail } from "./message-email";

const base = {
  conversation_id: "c1",
  message_kind: "text" as const,
  subject: null,
  sender: "Lise Leder",
  organization: "Demo Købmand ApS",
};

describe("messageEmail", () => {
  it("names the sender and links to the conversation", () => {
    const m = messageEmail(base, "https://turnus.example/");
    expect(m.subject).toBe("Ny besked fra Lise Leder i Turnus");
    expect(m.text).toContain("https://turnus.example/beskeder/c1");
    expect(m.text).toContain("Fra: Lise Leder");
  });

  it("uses a fixed subject for swaps, afbud and system messages", () => {
    expect(messageEmail({ ...base, message_kind: "swap" }, "x").subject).toBe(
      "Forslag om vagtbytte i Turnus",
    );
    expect(messageEmail({ ...base, message_kind: "cancellation" }, "x").subject).toBe(
      "Afbud til en vagt i Turnus",
    );
    expect(messageEmail({ ...base, message_kind: "system", sender: null }, "x").subject).toBe(
      "Nyt om en vagt i Turnus",
    );
  });

  it("escapes names in the HTML", () => {
    const m = messageEmail({ ...base, sender: "<b>Eve</b>", subject: "A & B" }, "x");
    expect(m.html).not.toContain("<b>Eve</b>");
    expect(m.html).toContain("&#60;b&#62;Eve");
    expect(m.html).toContain("A &#38; B");
  });
});
