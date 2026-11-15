import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { resolveAgreement } from "../agreement/resolve";
import { calculatePay } from "./index";
import { validateNotice } from "../validate";
import { shiftsToIntervals } from "../shifts";
import { cph, makeInput, shift } from "../../test/support";

const doc = parseAgreementDocument({
  id: "brk-test",
  name: "Breaks",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "x",
  rules: [
    {
      id: "sats",
      primitive: "pay_rate",
      source: "x",
      params: { pay_code: "NORMAL", rates: [{ hourly_ore: 12000 }] },
    },
  ],
});
const input = makeInput({ extraDocs: [doc], agreementId: "brk-test" });
const normal = (r: ReturnType<typeof calculatePay>) =>
  r.lines.filter((l) => l.payCode === "NORMAL").reduce((s, l) => s + l.quantityMinutes, 0);

describe("breaks with their own paid flag", () => {
  it("unpaid breaks are deducted, paid breaks are paid", () => {
    const s = shift("2026-01-05 08:00", "2026-01-05 16:00");
    const worked = [
      {
        ...s,
        breaks: [
          { start: cph("2026-01-05 10:00"), end: cph("2026-01-05 10:15"), paid: true },
          { start: cph("2026-01-05 12:00"), end: cph("2026-01-05 12:30"), paid: false },
        ],
      },
    ];
    const r = calculatePay({ ...input, worked, period: { from: "2026-01-05", to: "2026-01-05" } });
    expect(normal(r)).toBe(450);
    expect(r.dailyMinutes["2026-01-05"]).toBe(450);
  });
});

describe("shiftsToIntervals with several breaks", () => {
  it("keeps placed breaks and spreads unplaced ones evenly", () => {
    const [i] = shiftsToIntervals([
      {
        id: "s",
        start: cph("2026-01-05 08:00"),
        end: cph("2026-01-05 20:00"),
        breaks: [
          { start: cph("2026-01-05 09:30"), minutes: 15, paid: true },
          { start: null, minutes: 30, paid: false },
          { start: null, minutes: 30, paid: false },
        ],
      },
    ]);
    expect(i!.breaks).toEqual([
      { start: cph("2026-01-05 09:30"), end: cph("2026-01-05 09:45"), paid: true },
      { start: cph("2026-01-05 11:45"), end: cph("2026-01-05 12:15"), paid: false },
      { start: cph("2026-01-05 15:45"), end: cph("2026-01-05 16:15"), paid: false },
    ]);
  });
});

describe("manual shift supplements", () => {
  it("pays per hour, fixed and percent supplements with explanations", () => {
    const s = shift("2026-01-05 08:00", "2026-01-05 16:00", {
      breaks: [["2026-01-05 12:00", "2026-01-05 12:30"]],
    });
    const worked = [
      {
        ...s,
        supplements: [
          {
            id: "ansvar",
            label: "Ansvarstillæg",
            payCode: "ANSVAR",
            amount: { type: "ore_per_hour" as const, ore: 2500 },
            source: "Opsætning",
          },
          {
            id: "koersel",
            label: "Kørsel",
            payCode: "KOERSEL",
            amount: { type: "fixed" as const, ore: 10000 },
            source: "Opsætning",
          },
          {
            id: "smuds",
            label: "Smudstillæg",
            payCode: "SMUDS",
            amount: { type: "percent_of_base" as const, bp: 1000 },
            source: "Opsætning",
          },
        ],
      },
    ];
    const r = calculatePay({ ...input, worked, period: { from: "2026-01-05", to: "2026-01-05" } });
    const line = (code: string) => r.lines.find((l) => l.payCode === code)!;
    expect(line("ANSVAR")).toMatchObject({
      unit: "hours",
      quantityMinutes: 450,
      rateOre: 2500,
      amountOre: 18750,
    });
    expect(line("KOERSEL")).toMatchObject({ unit: "fixed", quantityMinutes: 0, amountOre: 10000 });
    expect(line("SMUDS")).toMatchObject({
      unit: "hours",
      quantityMinutes: 450,
      rateOre: 1200,
      amountOre: 9000,
    });
    expect(line("ANSVAR").explanation).toMatchObject({
      ruleId: "supplement:ansvar",
      primitive: "shift_supplement",
      source: "Opsætning",
    });
  });

  it("a supplement on a shift across midnight follows the pay period", () => {
    const s = shift("2026-01-05 22:00", "2026-01-06 02:00");
    const worked = [
      {
        ...s,
        supplements: [
          {
            id: "a",
            label: "A",
            payCode: "A",
            amount: { type: "ore_per_hour" as const, ore: 6000 },
            source: "x",
          },
        ],
      },
    ];
    const r = calculatePay({ ...input, worked, period: { from: "2026-01-06", to: "2026-01-06" } });
    expect(r.lines.find((l) => l.payCode === "A")).toMatchObject({
      quantityMinutes: 120,
      amountOre: 12000,
    });
  });
});

describe("organization layer", () => {
  it("is applied after the agreement and before the contract", () => {
    const r = resolveAgreement(input.registry, {
      agreementId: "brk-test",
      organizationLayer: {
        rules: [
          {
            id: "varsling",
            primitive: "notice",
            source: "Virksomhedens opsætning",
            params: { publish_notice_hours: 72, change_notice_hours: 24 },
          },
        ],
      },
      date: "2026-01-05",
    });
    const rule = r.rules.find((x) => x.id === "varsling")!;
    expect(rule.layers.at(-1)).toEqual({ agreementId: "organization", version: 1 });
  });

  it("notice can be configured in hours", () => {
    const r = validateNotice({
      ...input,
      organizationLayer: {
        rules: [
          {
            id: "varsling",
            primitive: "notice",
            source: "Opsætning",
            params: { publish_notice_hours: 72 },
          },
        ],
      },
      now: cph("2026-01-01 08:00"),
      items: [
        { intervalId: "ok", start: cph("2026-01-04 08:00"), change: "new" },
        { intervalId: "late", start: cph("2026-01-04 07:59"), change: "new" },
      ],
    });
    expect(r.violations.map((v) => v.intervalIds[0])).toEqual(["late"]);
  });
});
