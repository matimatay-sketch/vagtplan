import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculatePay,
  formatInstant,
  validateSchedule,
  wallTime,
  type EngineInput,
  type WorkIntervalInput,
} from "@vagtplan/rules-engine";
import { templateRegistry, templates } from "../index";

const TZ = "Europe/Copenhagen";
const root = join(import.meta.dirname, "..");

/** "2026-01-05 08:00" (Copenhagen wall time) → ISO instant. */
const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  return formatInstant(wallTime(d, t, TZ));
};

type Fixture = {
  description: string;
  employee: EngineInput["employee"];
  contract: {
    payForm: "hourly" | "monthly";
    weeklyNormMinutes: number;
    staffGroup: string | null;
    payStep: string | null;
  };
  period: { from: string; to: string };
  worked: (Omit<WorkIntervalInput, "breaks"> & { breaks?: { start: string; end: string }[] })[];
  planned?: Fixture["worked"];
  absences?: { id: string; type: string; from: string; to: string }[];
  expected: {
    lines: { payCode: string; rateOre: number; quantityMinutes: number; amountOre: number }[];
    dailyMinutes: Record<string, number>;
    violations: string[];
  };
};

const toIntervals = (list: Fixture["worked"] = []): WorkIntervalInput[] =>
  list.map((i) => ({
    ...i,
    start: at(i.start),
    end: at(i.end),
    breaks: (i.breaks ?? []).map((b) => ({ start: at(b.start), end: at(b.end) })),
  }));

describe("agreement templates", () => {
  it("all templates parse and resolve without errors", () => {
    expect(templates.map((t) => `${t.id}@v${t.version}`)).toEqual([
      "basis-dk@v1",
      "eksempel-detail@v1",
      "industriens-overenskomst@v1",
      "industriens-overenskomst@v2",
      "industriens-overenskomst@v3",
    ]);
  });
  it("the example agreement is flagged as fictitious", () => {
    expect(templates.find((t) => t.id === "eksempel-detail")!.example).toBe(true);
  });
});

for (const agreementId of ["basis-dk", "eksempel-detail"]) {
  const dir = join(root, agreementId, "fixtures");
  describe(`golden: ${agreementId}`, () => {
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture;
      it(`${file} – ${fx.description}`, () => {
        const input: EngineInput = {
          timezone: TZ,
          registry: templateRegistry(),
          employee: fx.employee,
          contracts: [
            {
              id: "c",
              validFrom: "2020-01-01",
              validTo: null,
              agreementId,
              localAgreementId: null,
              overrides: null,
              ...fx.contract,
            },
          ],
        };
        const pay = calculatePay({
          ...input,
          worked: toIntervals(fx.worked),
          planned: toIntervals(fx.planned),
          absences: fx.absences ?? [],
          period: fx.period,
        });
        const lines = pay.lines.map(({ payCode, rateOre, quantityMinutes, amountOre }) => ({
          payCode,
          rateOre,
          quantityMinutes,
          amountOre,
        }));
        expect(lines).toEqual(fx.expected.lines);
        expect(pay.dailyMinutes).toEqual(fx.expected.dailyMinutes);
        for (const line of pay.lines) expect(line.explanation.intervals.length).toBeGreaterThan(0);

        const validation = validateSchedule({
          ...input,
          intervals: toIntervals(fx.worked),
          absences: fx.absences ?? [],
          from: fx.period.from,
          to: fx.period.to,
        });
        expect(validation.violations.map((v) => `${v.code}@${v.date}:${v.severity}`)).toEqual(
          fx.expected.violations,
        );
      });
    }
  });
}

describe("supabase seed", () => {
  it("supabase/seeds/agreements.sql is up to date with the JSON templates", async () => {
    // @ts-expect-error – plain ESM script without type declarations
    const { render } = (await import("../scripts/generate-seed.mjs")) as { render: () => string };
    const current = readFileSync(
      join(root, "..", "..", "supabase", "seeds", "agreements.sql"),
      "utf8",
    );
    expect(current, "run: pnpm --filter @vagtplan/agreements seed").toBe(render());
  });
});
