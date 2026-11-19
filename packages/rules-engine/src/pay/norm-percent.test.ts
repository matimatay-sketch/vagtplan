import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

// Weekly norm 37 h = 2220 minutes (test contract). Overtime above the weekly norm.
const doc = parseAgreementDocument({
  id: "np-test",
  name: "Norm percent",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "unit test",
  rules: [
    {
      id: "sats",
      primitive: "pay_rate",
      source: "x",
      params: { pay_code: "NORMAL", rates: [{ hourly_ore: 12000 }] },
    },
    {
      id: "ot",
      primitive: "overtime",
      source: "x",
      params: {
        trigger: "weekly_norm",
        tiers: [
          { up_to_minutes: null, amount: { type: "percent_of_base", bp: 5000 }, pay_code: "OT" },
        ],
      },
    },
  ],
});

type Worked = ReturnType<typeof shift> & { normPercent?: number | null };
const run = (worked: Worked[]) =>
  calculatePay({
    ...makeInput({ extraDocs: [doc], agreementId: "np-test" }),
    worked,
    period: { from: "2026-01-05", to: "2026-01-11" },
  });
const otMinutes = (r: ReturnType<typeof calculatePay>) =>
  r.lines.filter((l) => l.payCode === "OT").reduce((s, l) => s + l.quantityMinutes, 0);

// Monday–Thursday 08–17: 4 × 540 = 2160 minutes at 100 %.
const monToThu = () =>
  ["05", "06", "07", "08"].map((d) => shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:00`));

describe("norm percent (share of a shift that counts towards the norm)", () => {
  it("without a percent, work counts in full and on-call not at all (as before)", () => {
    // 2160 + 480 = 2640 → 420 above 2220. The on-call shift does not change it.
    const r = run([
      ...monToThu(),
      shift("2026-01-09 08:00", "2026-01-09 16:00"),
      shift("2026-01-07 17:00", "2026-01-07 23:00", { kind: "on_call" }),
    ]);
    expect(otMinutes(r)).toBe(420);
  });

  it("a work shift at 50 %: overtime starts when the counted minutes pass the norm", () => {
    // Friday 08–18 = 600 minutes at 50 %. 60 norm minutes are left after Thursday,
    // which takes 120 real minutes; the remaining 480 minutes are overtime.
    const r = run([
      ...monToThu(),
      { ...shift("2026-01-09 08:00", "2026-01-09 18:00"), normPercent: 50 },
    ]);
    expect(otMinutes(r)).toBe(480);
  });

  it("a work shift above 100 % fills the norm faster (e.g. 150 %)", () => {
    // Friday 08–12 = 240 minutes at 150 % = 360 counted. 60 norm minutes are left
    // after Thursday, reached after 40 real minutes; the remaining 200 are overtime.
    const r = run([
      ...monToThu(),
      { ...shift("2026-01-09 08:00", "2026-01-09 12:00"), normPercent: 150 },
    ]);
    expect(otMinutes(r)).toBe(200);
  });

  it("on-call above 100 % reduces the norm by more than its length", () => {
    // 360 minutes at 200 % = 720 → norm 1500. Work 2160 → 660 minutes of overtime.
    const r = run([
      ...monToThu(),
      { ...shift("2026-01-07 17:00", "2026-01-07 23:00", { kind: "on_call" }), normPercent: 200 },
    ]);
    expect(otMinutes(r)).toBe(660);
  });

  it("a work shift at 0 % never makes overtime", () => {
    const r = run([
      ...monToThu(),
      { ...shift("2026-01-09 08:00", "2026-01-09 18:00"), normPercent: 0 },
    ]);
    expect(otMinutes(r)).toBe(0);
  });

  it("an on-call shift at 50 % fills the norm: 360 minutes reduce it by 180", () => {
    // Norm 2220 − 180 = 2040. Work 2640 → 600 minutes of overtime.
    const r = run([
      ...monToThu(),
      shift("2026-01-09 08:00", "2026-01-09 16:00"),
      { ...shift("2026-01-07 17:00", "2026-01-07 23:00", { kind: "on_call" }), normPercent: 50 },
    ]);
    expect(otMinutes(r)).toBe(600);
  });
});
