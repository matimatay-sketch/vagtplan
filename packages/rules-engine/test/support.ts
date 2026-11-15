import { Temporal } from "temporal-polyfill";
import { parseAgreementDocument, type AgreementDocument } from "../src/agreement/schema";
import type { ContractFacts, EngineInput, EmployeeFacts } from "../src/model";

/** A law-like base document used by unit tests (independent of packages/agreements). */
export const testBase: AgreementDocument = parseAgreementDocument({
  id: "test-base",
  name: "Test base",
  kind: "base",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: null,
  source: "Unit test",
  rules: [
    {
      id: "helligdage",
      primitive: "holiday_calendar",
      source: "test",
      params: {
        holidays: [
          "nytaarsdag",
          "skaertorsdag",
          "langfredag",
          "paaskedag",
          "anden_paaskedag",
          "kristi_himmelfartsdag",
          "pinsedag",
          "anden_pinsedag",
          "juledag",
          "anden_juledag",
        ],
      },
    },
    {
      id: "hviletid",
      primitive: "rest",
      source: "test",
      params: { daily_minutes: 660, weekly_minutes: 1440, weekly_period: "calendar_week" },
    },
    {
      id: "max-48",
      primitive: "max_weekly_average",
      source: "test",
      params: {
        max_average_minutes: 2880,
        warning_average_minutes: 2640,
        reference_months: 4,
        reference_anchor: "01-01",
      },
    },
    {
      id: "pause",
      primitive: "break",
      source: "test",
      params: { after_minutes: 360, min_minutes: null, paid: false },
    },
    {
      id: "unge",
      primitive: "young_worker",
      source: "test",
      params: {
        groups: [
          {
            id: "under-15-eller-undervisningspligtig-u15",
            label: "Under 15",
            applies: { max_age: 15 },
            max_daily_minutes: 420,
            max_daily_minutes_school_day: 120,
            min_rest_minutes: 840,
            break_after_minutes: 270,
            break_min_minutes: 30,
          },
          {
            id: "undervisningspligtig",
            label: "Undervisningspligtig",
            applies: { max_age: 18, school_obligated: true },
            max_daily_minutes: 420,
            max_daily_minutes_school_day: 120,
            min_rest_minutes: 840,
            break_after_minutes: 270,
            break_min_minutes: 30,
          },
          {
            id: "15-17",
            label: "15–17 år",
            applies: { min_age: 15, max_age: 18, school_obligated: false },
            max_daily_minutes: 480,
            max_weekly_minutes: 2400,
            min_rest_minutes: 720,
            break_after_minutes: 270,
            break_min_minutes: 30,
          },
        ],
      },
    },
  ],
});

export function makeInput(
  over: Omit<Partial<EngineInput>, "employee" | "registry"> & {
    extraDocs?: AgreementDocument[];
    agreementId?: string;
    contract?: Partial<ContractFacts>;
    employee?: Partial<EmployeeFacts>;
  } = {},
): EngineInput {
  const registry: EngineInput["registry"] = { "test-base": [testBase] };
  for (const d of over.extraDocs ?? []) (registry[d.id] ??= []).push(d);
  return {
    timezone: "Europe/Copenhagen",
    registry,
    employee: {
      birthDate: "1990-01-01",
      schoolObligated: false,
      schoolObligationEndsOn: null,
      ...over.employee,
    },
    contracts: over.contracts ?? [
      {
        id: "c1",
        validFrom: "2020-01-01",
        validTo: null,
        agreementId: over.agreementId ?? "test-base",
        localAgreementId: null,
        overrides: null,
        payForm: "hourly",
        weeklyNormMinutes: 2220,
        staffGroup: null,
        payStep: null,
        ...over.contract,
      },
    ],
    schoolDays: over.schoolDays ?? null,
  };
}

/** Local Copenhagen wall time → ISO instant string (for readable tests). */
export function cph(local: string): string {
  // local: "2026-01-05 08:00"
  const [d, t] = local.split(" ") as [string, string];
  return Temporal.PlainDateTime.from(`${d}T${t}`)
    .toZonedDateTime("Europe/Copenhagen", { disambiguation: "compatible" })
    .toInstant()
    .toString();
}

let seq = 0;
export function shift(
  from: string,
  to: string,
  extra: Partial<{
    id: string;
    kind: "work" | "on_call" | "call_out";
    breaks: [string, string][];
    plannedShiftId: string;
  }> = {},
) {
  return {
    id: extra.id ?? `s${++seq}`,
    start: cph(from),
    end: cph(to),
    kind: extra.kind ?? "work",
    breaks: (extra.breaks ?? []).map(([a, b]) => ({ start: cph(a), end: cph(b) })),
    plannedShiftId: extra.plannedShiftId ?? null,
  };
}
