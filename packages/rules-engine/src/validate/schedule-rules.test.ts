import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { validateNotice, validateSchedule } from "./index";
import { shiftsToIntervals } from "../shifts";
import { cph, makeInput, shift } from "../../test/support";

const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "plan-test",
    name: "Plan",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "x",
    rules,
  });

const notice: RuleLayer = {
  id: "varsel",
  primitive: "notice",
  source: "§ varsel",
  params: { publish_notice_days: 14, change_notice_hours: 96 },
};
const weekendOff: RuleLayer = {
  id: "weekendfri",
  primitive: "weekend_off",
  source: "§ weekend",
  params: { weekends_off: 2, per_weeks: 4 },
};

describe("notice (varsling)", () => {
  const input = makeInput({ extraDocs: [doc([notice])], agreementId: "plan-test" });

  it("a new shift published exactly 14 days ahead is fine; 13 days 23 h is late", () => {
    const now = cph("2026-01-01 08:00");
    const ok = validateNotice({
      ...input,
      now,
      items: [{ intervalId: "a", start: cph("2026-01-15 08:00"), change: "new" }],
    });
    expect(ok.violations).toEqual([]);
    const late = validateNotice({
      ...input,
      now,
      items: [{ intervalId: "b", start: cph("2026-01-15 07:00"), change: "new" }],
    });
    expect(late.violations.map((v) => [v.code, v.severity, v.date, v.intervalIds])).toEqual([
      ["NOTICE_LATE", "WARNING", "2026-01-15", ["b"]],
    ]);
  });

  it("changes need 96 hours notice", () => {
    const now = cph("2026-01-01 08:00");
    const r = validateNotice({
      ...input,
      now,
      items: [
        { intervalId: "c1", start: cph("2026-01-05 08:00"), change: "changed" },
        { intervalId: "c2", start: cph("2026-01-05 07:59"), change: "removed" },
      ],
    });
    expect(r.violations.map((v) => v.intervalIds[0])).toEqual(["c2"]);
    expect(r.violations[0]!.details).toMatchObject({ requiredHours: 96, change: "removed" });
  });

  it("no notice rule → no violations", () => {
    const r = validateNotice({
      ...makeInput(),
      now: cph("2026-01-01 08:00"),
      items: [{ intervalId: "x", start: cph("2026-01-01 09:00"), change: "new" }],
    });
    expect(r.violations).toEqual([]);
  });
});

describe("weekend off (weekendfri)", () => {
  const input = makeInput({ extraDocs: [doc([weekendOff])], agreementId: "plan-test" });
  // Saturdays in Jan 2026: 3, 10, 17, 24, 31
  const sat = (d: string) => shift(`2026-01-${d} 10:00`, `2026-01-${d} 14:00`);
  const codes = (r: ReturnType<typeof validateSchedule>) =>
    r.violations.filter((v) => v.code === "WEEKEND_OFF").map((v) => `${v.date}:${v.severity}`);

  it("two free weekends in four weeks is fine", () => {
    const r = validateSchedule({
      ...input,
      intervals: [sat("03"), sat("10")],
      from: "2025-12-29",
      to: "2026-01-25",
    });
    expect(codes(r)).toEqual([]);
  });

  it("three worked weekends in four weeks is a warning", () => {
    const r = validateSchedule({
      ...input,
      intervals: [sat("03"), sat("10"), sat("17")],
      from: "2026-01-19",
      to: "2026-01-25",
    });
    expect(codes(r)).toEqual(["2026-01-19:WARNING"]);
  });

  it("a Sunday night shift ending after midnight into Monday still touches the weekend", () => {
    const sunNight = (d: string) =>
      shift(`2026-01-${d} 22:00`, `2026-01-${String(Number(d) + 1).padStart(2, "0")} 06:00`);
    const r = validateSchedule({
      ...input,
      intervals: [sunNight("04"), sunNight("11"), sunNight("18")],
      from: "2026-01-19",
      to: "2026-01-25",
    });
    expect(codes(r)).toEqual(["2026-01-19:WARNING"]);
  });
});

describe("shiftsToIntervals", () => {
  it("places planned break minutes in the middle of the shift", () => {
    const [i] = shiftsToIntervals([
      { id: "s", start: cph("2026-01-05 08:00"), end: cph("2026-01-05 16:00"), breakMinutes: 30 },
    ]);
    expect(i!.breaks).toEqual([
      { start: cph("2026-01-05 11:45"), end: cph("2026-01-05 12:15"), paid: false },
    ]);
  });
  it("ignores breaks that do not fit", () => {
    const [i] = shiftsToIntervals([
      {
        id: "s",
        start: cph("2026-01-05 08:00"),
        end: cph("2026-01-05 08:20"),
        breakMinutes: 30,
        kind: "on_call",
      },
    ]);
    expect(i).toMatchObject({ breaks: [], kind: "on_call" });
  });
});
