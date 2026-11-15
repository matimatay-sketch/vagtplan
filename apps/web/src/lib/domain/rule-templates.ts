/**
 * Starting points for new rules in the agreement editor. Amounts and limits
 * start at 0 / empty: the consultant fills them in from the agreement text
 * (never invented here). Pure.
 */
import type { Primitive } from "@vagtplan/rules-engine";
import { defaultCondition, newRemarkRule } from "./remarks";

export const RULE_TYPES: {
  primitive: Primitive;
  label: string;
  group: "pay" | "time" | "leave" | "other";
}[] = [
  { primitive: "pay_rate", label: "Lønsats (grundløn)", group: "pay" },
  {
    primitive: "time_window_supplement",
    label: "Tillæg i et tidsrum (aften, nat, weekend, helligdag)",
    group: "pay",
  },
  { primitive: "overtime", label: "Overarbejde", group: "pay" },
  { primitive: "min_shift", label: "Minimum vagtlængde / garantibetaling", group: "pay" },
  { primitive: "on_call", label: "Rådighed og tilkald", group: "pay" },
  { primitive: "rounding", label: "Afrunding af stemplinger", group: "pay" },
  { primitive: "norm", label: "Normtid", group: "time" },
  { primitive: "break", label: "Pause", group: "time" },
  { primitive: "rest", label: "Hviletid og fridøgn", group: "time" },
  { primitive: "max_weekly_average", label: "Gennemsnitlig ugentlig arbejdstid", group: "time" },
  { primitive: "night_work", label: "Natarbejde", group: "time" },
  { primitive: "young_worker", label: "Unge under 18", group: "time" },
  { primitive: "notice", label: "Varsling af vagtplan", group: "time" },
  { primitive: "weekend_off", label: "Fri weekender", group: "time" },
  { primitive: "holiday_calendar", label: "Helligdage", group: "time" },
  { primitive: "time_off_accrual", label: "Optjening af frihed (afspadsering)", group: "leave" },
  { primitive: "absence", label: "Fraværstyper", group: "leave" },
  { primitive: "vacation", label: "Ferie og feriefridage", group: "leave" },
  { primitive: "remark", label: "Anmærkning", group: "other" },
];

const ascii = (s: string) => s.replace(/æ/gi, "ae").replace(/ø/gi, "oe").replace(/å/gi, "aa");

/** A pay code from a name: "Aftentillæg lager" → "AFTENTILLAEG_LAGER". */
export function payCodeFrom(name: string): string {
  const code = ascii(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/, "");
  return code || "LOENART";
}

function ruleId(name: string, existing: readonly string[]): string {
  const base =
    ascii(name.toLowerCase())
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56)
      .replace(/-+$/, "") || "regel";
  let id = base;
  for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`;
  return id;
}

const ZERO_AMOUNT = { type: "ore_per_hour", ore: 0 } as const;

function defaultParams(primitive: Primitive, name: string): Record<string, unknown> {
  const code = payCodeFrom(name);
  switch (primitive) {
    case "pay_rate":
      return { pay_code: code, rates: [{ hourly_ore: 0 }] };
    case "time_window_supplement":
      return {
        windows: [{ days: ["weekday"], from: "00:00", to: "24:00" }],
        amount: ZERO_AMOUNT,
        pay_code: code,
      };
    case "overtime":
      return {
        trigger: "weekly_norm",
        tiers: [
          { up_to_minutes: null, amount: { type: "percent_of_base", bp: 0 }, pay_code: code },
        ],
      };
    case "min_shift":
      return { min_minutes: 0, guarantee_pay: false, pay_code: code };
    case "on_call":
      return {
        amount: ZERO_AMOUNT,
        pay_code: code,
        call_out_min_minutes: 0,
        call_out_guarantee_pay_code: `${code.slice(0, 24)}_TILKALD`,
      };
    case "rounding":
      return { unit_minutes: 1, start: "nearest", end: "nearest" };
    case "norm":
      return { period: { type: "week" } };
    case "break":
      return { after_minutes: 0, min_minutes: null, paid: false };
    case "rest":
      return { daily_minutes: 0, weekly_minutes: 0, weekly_period: "calendar_week" };
    case "max_weekly_average":
      return {
        max_average_minutes: 0,
        warning_average_minutes: 0,
        reference_months: 1,
        reference_anchor: "01-01",
      };
    case "night_work":
      return {
        from: "00:00",
        to: "00:00",
        night_shift_min_minutes: 0,
        max_average_daily_minutes: 0,
        reference_days: 1,
      };
    case "young_worker":
      return { groups: [{ id: "gruppe-1", label: name, applies: {} }] };
    case "notice":
      return {};
    case "weekend_off":
      return { weekends_off: 0, per_weeks: 1 };
    case "holiday_calendar":
      return {};
    case "absence":
      return {
        types: [
          {
            code:
              ascii(name.toLowerCase())
                .replace(/[^a-z]+/g, "_")
                .replace(/^_+|_+$/g, "") || "fravaer",
            label: name,
            payment: "none",
            pay_code: null,
            counts_towards_norm: false,
          },
        ],
      };
    case "vacation":
      return {
        days_per_month: 0,
        holiday_year_start: "01-01",
        usage_extends_months: 0,
        main_holiday: { min_consecutive_days: 0, from: "01-01", to: "12-31" },
        vacation_pay_bp: null,
        vacation_supplement_bp: null,
        special_vacation_pay_bp: null,
      };
    case "time_off_accrual":
      return {
        pay_code: code,
        basis: {
          type: "worked_in_windows",
          windows: [{ days: ["any"], from: "00:00", to: "24:00" }],
          per_minutes: 60,
          earn_minutes: 1,
        },
      };
    case "remark":
      return newRemarkRule(name, [], defaultCondition("shift_longer_than")).params;
  }
}

export type NewRule = {
  id: string;
  primitive: Primitive;
  label: string;
  source: string;
  todo_jura: string;
  params: Record<string, unknown>;
  severity?: "WARNING";
};

export function newRule(
  primitive: Primitive,
  name: string,
  existingIds: readonly string[],
): NewRule {
  if (primitive === "remark") {
    const r = newRemarkRule(name, existingIds, defaultCondition("shift_longer_than"));
    return { ...r, todo_jura: "Udfyld grænsen." };
  }
  return {
    id: ruleId(name, existingIds),
    primitive,
    label: name,
    source: "Udfyld kilde (§)",
    todo_jura: "Udfyld satser og grænser fra overenskomstteksten.",
    params: defaultParams(primitive, name),
  };
}

type AnyRule = { primitive?: string; params?: unknown };

/** Pay codes the rules refer to (sorted, unique). */
export function payCodesUsed(rules: readonly AnyRule[]): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v) out.add(v);
  };
  for (const r of rules) {
    const p = (r.params ?? {}) as Record<string, unknown>;
    add(p.pay_code);
    add(p.call_out_guarantee_pay_code);
    for (const t of (Array.isArray(p.tiers) ? p.tiers : []) as { pay_code?: unknown }[])
      add(t.pay_code);
    for (const t of (Array.isArray(p.types) ? p.types : []) as { pay_code?: unknown }[])
      add(t.pay_code);
  }
  return [...out].sort();
}
