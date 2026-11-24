import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDES, guideBySlug, guidesFor } from "./guides";

describe("guidesFor", () => {
  it("everyone gets the employee guide; managers and administrators also get theirs", () => {
    expect(guidesFor({}).map((g) => g.slug)).toEqual(["medarbejder"]);
    expect(guidesFor({ "schedule.manage": "departments" }).map((g) => g.slug)).toEqual([
      "medarbejder",
      "leder",
    ]);
    expect(
      guidesFor({ "settings.manage": "organization", "time.approve": "organization" }).map(
        (g) => g.slug,
      ),
    ).toEqual(["medarbejder", "leder", "administrator"]);
  });

  it("finds a guide by its address", () => {
    expect(guideBySlug("leder")?.title).toBe("Turnus for ledere");
    expect(guideBySlug("ukendt")).toBeUndefined();
  });
});

describe("the guides", () => {
  it("have unique sections, and every screenshot exists", () => {
    for (const g of GUIDES) {
      const ids = g.sections.map((s) => s.id);
      expect(new Set(ids).size, g.slug).toBe(ids.length);
      for (const s of g.sections)
        if (s.image)
          expect(existsSync(join(process.cwd(), "public/vejledninger", s.image)), s.image).toBe(
            true,
          );
    }
  });

  it("only use characters the PDF font can print (Windows-1252)", () => {
    // Latin-1 plus the Windows-1252 extras used in Danish text (dashes, quotes, bullet).
    const ok = /^[ -~ -ÿ–—‘’“”•…\n]*$/;
    for (const g of GUIDES) {
      const text = [
        g.title,
        g.lead,
        ...g.sections.flatMap((s) => [
          s.title,
          ...s.text,
          ...(s.steps ?? []),
          s.tip ?? "",
          s.imageAlt ?? "",
        ]),
      ].join("\n");
      expect(ok.test(text), g.slug).toBe(true);
    }
  });
});
