import { describe, expect, it } from "vitest";
import { Pseudonyms } from "./pseudonyms";

describe("Pseudonyms", () => {
  it("gives stable codes per kind and id", () => {
    const p = new Pseudonyms();
    expect(p.code("employee", "e1", "Mads Medarbejder")).toBe("MEDARBEJDER_1");
    expect(p.code("employee", "e2", "Ida Ung")).toBe("MEDARBEJDER_2");
    expect(p.code("employee", "e1", "Mads Medarbejder")).toBe("MEDARBEJDER_1");
    expect(p.code("department", "d1", "Butik")).toBe("AFDELING_1");
    expect(p.idOf("MEDARBEJDER_2")).toBe("e2");
    expect(p.idOf("MEDARBEJDER_9")).toBeNull();
  });

  it("removes known names from free text before it is sent (full and first names)", () => {
    const p = new Pseudonyms();
    p.code("employee", "e1", "Mads Medarbejder");
    p.code("employee", "e2", "Ida Ung");
    p.code("department", "d1", "Butik");
    expect(p.scrub("Hvorfor fik Mads Medarbejder aftentillæg, og Ida i Butik?")).toBe(
      "Hvorfor fik MEDARBEJDER_1 aftentillæg, og MEDARBEJDER_2 i AFDELING_1?",
    );
    expect(p.scrub("mads skal have fri")).toBe("MEDARBEJDER_1 skal have fri");
  });

  it("does not replace parts of other words", () => {
    const p = new Pseudonyms();
    p.code("employee", "e1", "Ib Hansen");
    expect(p.scrub("Ibrahim og Ib")).toBe("Ibrahim og MEDARBEJDER_1");
  });

  it("removes e-mail addresses and long digit runs (CPR, phone)", () => {
    const p = new Pseudonyms();
    expect(p.scrub("Skriv til a@b.dk eller 12345678, cpr 010203-1234")).toBe(
      "Skriv til [e-mail] eller [nummer], cpr [nummer]",
    );
  });

  it("restores codes to names in the answer", () => {
    const p = new Pseudonyms();
    p.code("employee", "e1", "Mads Medarbejder");
    p.code("department", "d1", "Butik");
    expect(p.restore("MEDARBEJDER_1 arbejder i AFDELING_1. MEDARBEJDER_7 findes ikke.")).toBe(
      "Mads Medarbejder arbejder i Butik. MEDARBEJDER_7 findes ikke.",
    );
  });
});
