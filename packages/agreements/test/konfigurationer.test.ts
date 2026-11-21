import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculatePay,
  formatInstant,
  parseAgreementDocument,
  resolveAgreement,
  wallTime,
  type AgreementDocument,
  type EngineInput,
} from "@vagtplan/rules-engine";
import { starterKits, templateRegistry, templates } from "../index";

/**
 * Concrete agreements: the ones set up as data in docs/konfigurationer and the
 * bundled Industriens Overenskomst template. They parse, resolve on top of
 * basis-dk without falling below the law, and Industriens Overenskomst gives
 * the pay lines calculated by hand. Its startpakke matches its rate dates.
 */
const TZ = "Europe/Copenhagen";
const configDir = join(import.meta.dirname, "..", "..", "..", "docs", "konfigurationer");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return jsonFiles(p);
    return f.endsWith(".json") ? [p] : [];
  });
}

const docs: AgreementDocument[] = [
  ...jsonFiles(configDir).map((f) => parseAgreementDocument(JSON.parse(readFileSync(f, "utf8")))),
  ...templates.filter((t) => t.id === "industriens-overenskomst"),
];

function registry() {
  const r = templateRegistry();
  for (const d of docs) if (!r[d.id]?.includes(d)) (r[d.id] ??= []).push(d);
  return r;
}

describe("docs/konfigurationer", () => {
  it("the Industriens Overenskomst startpakke follows the agreement's rate dates", () => {
    const kit = starterKits.find((k) => k.key === "industriens-overenskomst")!;
    expect(templates.some((t) => t.id === kit.agreement)).toBe(true);
    const dates = templates
      .filter((t) => t.id === kit.agreement)
      .map((t) => t.valid_from)
      .sort();
    for (const s of kit.supplement_types) {
      expect(s.amounts.map((a) => a.valid_from)).toEqual(dates);
      expect(s.pay_code).toMatch(/^[A-Z0-9_]{1,32}$/);
      expect(s.amounts.every((a) => Number.isInteger(a.amount) && a.amount > 0)).toBe(true);
    }
    // § 28: periods start on a Monday.
    for (const g of kit.pay_period_groups)
      expect(new Date(`${g.anchor_date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("finds the configured agreements", () => {
    expect(new Set(docs.map((d) => d.id))).toEqual(
      new Set([
        "kl-04-89-arbejdstid-forskudt-tid-holddrift-og-raadighedsvagt",
        "industriens-overenskomst",
      ]),
    );
  });

  for (const d of docs)
    it(`${d.id} v${d.version} resolves without going below the law`, () => {
      const r = resolveAgreement(registry(), {
        agreementId: d.id,
        localAgreementId: null,
        contractOverrides: null,
        date: d.valid_from,
      });
      expect(r.warnings.map((w) => w.code)).not.toContain("BELOW_LAW_MINIMUM");
      expect(r.warnings.map((w) => w.code)).not.toContain("LAW_RULE_REMOVED");
    });

  it("Industriens Overenskomst has one version per rate date, without gaps", () => {
    const io = docs
      .filter((d) => d.id === "industriens-overenskomst")
      .sort((a, b) => a.version - b.version);
    expect(io.map((d) => [d.valid_from, d.valid_to])).toEqual([
      ["2025-05-01", "2026-02-28"],
      ["2026-03-01", "2027-02-28"],
      ["2027-03-01", null],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Industriens Overenskomst: test weeks with the rates from 1 March 2026
// (timeløn 143,40, overarbejde 48,10 / 76,80 / 143,70, søndag til kl. 12 95,75,
// forskudt tid 32,60 / 53,20 / 62,70, skiftehold 50,40 / 108,00).
// ---------------------------------------------------------------------------
const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  return formatInstant(wallTime(d, t, TZ));
};
const span = (id: string, from: string, to: string) => ({
  id,
  start: at(from),
  end: at(to),
  kind: "work" as const,
  breaks: [],
});

function pay(opts: {
  staffGroup: string | null;
  worked: ReturnType<typeof span>[];
  planned?: ReturnType<typeof span>[];
  from: string;
  to: string;
  birthDate?: string;
  seniorityDate?: string;
  absences?: { id: string; type: string; from: string; to: string }[];
}) {
  const input: EngineInput = {
    timezone: TZ,
    registry: registry(),
    employee: {
      birthDate: opts.birthDate ?? "1990-01-01",
      schoolObligated: false,
      schoolObligationEndsOn: null,
    },
    contracts: [
      {
        id: "c",
        validFrom: "2026-01-01",
        validTo: null,
        agreementId: "industriens-overenskomst",
        localAgreementId: null,
        overrides: null,
        payForm: "hourly",
        weeklyNormMinutes: 2220,
        staffGroup: opts.staffGroup,
        payStep: null,
        seniorityDate: opts.seniorityDate ?? "2020-01-01",
      },
    ],
  };
  const r = calculatePay({
    ...input,
    worked: opts.worked,
    planned: opts.planned ?? opts.worked.map((w) => ({ ...w, id: `p-${w.id}` })),
    absences: opts.absences ?? [],
    period: { from: opts.from, to: opts.to },
  });
  const sums = new Map<string, { minutes: number; amountOre: number }>();
  for (const l of r.lines) {
    const s = sums.get(l.payCode) ?? { minutes: 0, amountOre: 0 };
    sums.set(l.payCode, {
      minutes: s.minutes + l.quantityMinutes,
      amountOre: s.amountOre + l.amountOre,
    });
  }
  return {
    lines: Object.fromEntries([...sums].sort(([a], [b]) => a.localeCompare(b))),
    notes: r.notes,
  };
}

describe("Industriens Overenskomst – test weeks (calculated by hand)", () => {
  it("dagarbejde: overarbejde 15–18 after a shift 07–15 is 2 + 1 clock hours, and the hours are earned as time off", () => {
    const r = pay({
      staffGroup: "Dagarbejde",
      planned: [span("p", "2026-03-02 07:00", "2026-03-02 15:00")],
      worked: [span("w", "2026-03-02 07:00", "2026-03-02 18:00")],
      from: "2026-03-02",
      to: "2026-03-02",
    });
    expect(r.lines).toEqual({
      AFSPADSERING: { minutes: 180, amountOre: 0 },
      OT_1_2: { minutes: 120, amountOre: 9620 }, // 2 t × 48,10
      OT_3_4: { minutes: 60, amountOre: 7680 }, // 1 t × 76,80
      TIMELOEN: { minutes: 660, amountOre: 157740 }, // 11 t × 143,40
    });
  });

  it("dagarbejde: Sunday 08–14 without a planned shift", () => {
    const r = pay({
      staffGroup: "Dagarbejde",
      planned: [],
      worked: [span("w", "2026-03-08 08:00", "2026-03-08 14:00")],
      from: "2026-03-08",
      to: "2026-03-08",
    });
    expect(r.lines).toEqual({
      AFSPADSERING: { minutes: 360, amountOre: 0 },
      OT_SOEN_EM: { minutes: 120, amountOre: 28740 }, // 2 t × 143,70
      OT_SOEN_FM: { minutes: 240, amountOre: 38300 }, // 4 t × 95,75
      TIMELOEN: { minutes: 360, amountOre: 86040 }, // 6 t × 143,40
    });
  });

  it("grundlovsdag 2026 (Friday): before 12 as a free weekday, after 12 as a holiday", () => {
    const r = pay({
      staffGroup: "Dagarbejde",
      planned: [],
      worked: [span("w", "2026-06-05 10:00", "2026-06-05 14:00")],
      from: "2026-06-05",
      to: "2026-06-05",
    });
    expect(r.lines).toEqual({
      AFSPADSERING: { minutes: 240, amountOre: 0 },
      OT_FRIDAG_DAG: { minutes: 120, amountOre: 15360 }, // 2 t × 76,80
      OT_SOEN_EM: { minutes: 120, amountOre: 28740 }, // 2 t × 143,70
      TIMELOEN: { minutes: 240, amountOre: 57360 }, // 4 t × 143,40
    });
  });

  it("forskudt tid: a shift begun at 24 gets tillæg 3; a shift begun at 18 gets tillæg 1 and 2", () => {
    const r = pay({
      staffGroup: "Forskudt tid",
      worked: [
        span("a", "2026-03-03 00:00", "2026-03-03 08:00"),
        span("b", "2026-03-04 18:00", "2026-03-05 02:00"),
      ],
      from: "2026-03-03",
      to: "2026-03-05",
    });
    expect(r.lines).toEqual({
      FORSKUDT_1: { minutes: 240, amountOre: 13040 }, // 4 t × 32,60
      FORSKUDT_2: { minutes: 240, amountOre: 21280 }, // 4 t × 53,20
      FORSKUDT_3: { minutes: 360, amountOre: 37620 }, // 6 t × 62,70
      TIMELOEN: { minutes: 960, amountOre: 229440 }, // 16 t × 143,40
    });
  });

  it("skiftehold: Friday evening tillæg 1, Saturday from 14 tillæg 2", () => {
    const r = pay({
      staffGroup: "Skiftehold",
      worked: [
        span("fre", "2026-03-06 14:00", "2026-03-06 22:00"),
        span("loer", "2026-03-07 14:00", "2026-03-07 22:00"),
      ],
      from: "2026-03-06",
      to: "2026-03-07",
    });
    expect(r.lines).toEqual({
      SKIFT_1: { minutes: 240, amountOre: 20160 }, // 4 t × 50,40
      SKIFT_2: { minutes: 480, amountOre: 86400 }, // 8 t × 108,00
      TIMELOEN: { minutes: 960, amountOre: 229440 }, // 16 t × 143,40
    });
  });

  it("weekendarbejde: Saturday 06–18 is paid with the free-weekday supplement", () => {
    const r = pay({
      staffGroup: "Weekend",
      worked: [span("loer", "2026-03-07 06:00", "2026-03-07 18:00")],
      from: "2026-03-07",
      to: "2026-03-07",
    });
    expect(r.lines).toEqual({
      TIMELOEN: { minutes: 720, amountOre: 172080 }, // 12 t × 143,40
      WEEKEND_LOER: { minutes: 720, amountOre: 92160 }, // 12 t × 76,80
    });
  });

  it("under 18: the youth minimum", () => {
    const r = pay({
      staffGroup: "Dagarbejde",
      birthDate: "2010-01-01",
      worked: [span("w", "2026-03-02 08:00", "2026-03-02 12:00")],
      from: "2026-03-02",
      to: "2026-03-02",
    });
    expect(r.lines).toEqual({ TIMELOEN: { minutes: 240, amountOre: 33040 } }); // 4 t × 82,60
  });

  it("sick pay needs 6 months of seniority", () => {
    const sick = [{ id: "s", type: "sick", from: "2026-03-03", to: "2026-03-03" }];
    const paid = pay({
      staffGroup: "Dagarbejde",
      worked: [],
      absences: sick,
      from: "2026-03-03",
      to: "2026-03-03",
    });
    expect(paid.lines).toEqual({ SYG: { minutes: 444, amountOre: 106116 } }); // 7,4 t × 143,40
    const fresh = pay({
      staffGroup: "Dagarbejde",
      worked: [],
      absences: sick,
      seniorityDate: "2026-01-01",
      from: "2026-03-03",
      to: "2026-03-03",
    });
    expect(fresh.lines).toEqual({});
    expect(fresh.notes.map((n) => n.code)).toContain("ABSENCE_UNPAID_SENIORITY");
  });
});
