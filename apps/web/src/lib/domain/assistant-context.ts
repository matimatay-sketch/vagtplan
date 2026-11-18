/**
 * What the AI assistant is told. Everything goes through Pseudonyms: people
 * and departments become codes, and no names, numbers or e-mails are included.
 */
import type { Pseudonyms } from "./pseudonyms";
import { localParts } from "./schedule-time";
import { formatKroner } from "./numbers";

type Explanation = {
  ruleId: string;
  primitive: string;
  source: string;
  layer: { agreementId: string; version: number };
  note: string | null;
  intervals?: { date: string; start: string; end: string; minutes: number }[];
};

export type PayLineRow = {
  pay_code: string;
  label: string;
  unit: string;
  quantity_minutes: number;
  rate_ore: number;
  amount_ore: number;
  posting: Record<string, string>;
  explanation: Explanation;
};

const hours = (m: number) => `${(m / 60).toFixed(2).replace(".", ",")} timer`;
const km = (m: number) => `${(m / 1000).toFixed(2).replace(".", ",")} km`;

/** The key used for rule parameters: agreement@version#rule. */
export const ruleKey = (agreementId: string, version: number, ruleId: string) =>
  `${agreementId}@${version}#${ruleId}`;

export function payContext(
  input: {
    employee: { id: string; name: string; number: string };
    period: { start: string; end: string };
    lines: readonly PayLineRow[];
    notes: readonly { code: string; message: string }[];
    /** Rule parameters from the agreement versions, by ruleKey. */
    ruleParams: Record<string, unknown>;
    /** dimension and value ids → names/codes (not personal data). */
    postingNames: Record<string, string>;
  },
  p: Pseudonyms,
) {
  return {
    employee: p.code("employee", input.employee.id, input.employee.name),
    period: `${input.period.start} – ${input.period.end}`,
    lines: input.lines.map((l) => ({
      pay_code: l.pay_code,
      text: l.label,
      quantity:
        l.unit === "fixed"
          ? "fast beløb"
          : l.unit === "km"
            ? km(l.quantity_minutes)
            : l.unit === "time_off_minutes"
              ? `${hours(l.quantity_minutes)} frihed`
              : hours(l.quantity_minutes),
      rate_kr: formatKroner(l.rate_ore),
      amount_kr: formatKroner(Number(l.amount_ore)),
      posting: Object.fromEntries(
        Object.entries(l.posting ?? {}).map(([d, v]) => [
          input.postingNames[d] ?? "dimension",
          input.postingNames[v] ?? "værdi",
        ]),
      ),
      rule: {
        id: l.explanation.ruleId,
        type: l.explanation.primitive,
        source: l.explanation.source,
        agreement: `${l.explanation.layer.agreementId} v${l.explanation.layer.version}`,
        note: l.explanation.note,
        params:
          input.ruleParams[
            ruleKey(
              l.explanation.layer.agreementId,
              l.explanation.layer.version,
              l.explanation.ruleId,
            )
          ] ?? null,
      },
      periods: (l.explanation.intervals ?? []).map(
        (i) => `${i.date} ${i.start}–${i.end} (${i.minutes} min)`,
      ),
    })),
    notes: input.notes.map((n) => n.message),
  };
}

export function scheduleContext(
  input: {
    department: { id: string; name: string };
    weekDates: readonly string[];
    employees: readonly {
      id: string;
      name: string;
      weeklyNormMinutes: number | null;
      under18: boolean;
      availability: readonly {
        date: string;
        kind: string;
        from: string | null;
        to: string | null;
      }[];
      absences: readonly { from: string; to: string; type: string }[];
    }[];
    existing: readonly { employeeId: string | null; start: string; end: string; status: string }[];
    templates: readonly { name: string; start: string; end: string; breakMinutes: number }[];
  },
  p: Pseudonyms,
) {
  const code = (id: string | null, name = "") => (id ? p.code("employee", id, name) : null);
  const names = new Map(input.employees.map((e) => [e.id, e.name]));
  return {
    department: p.code("department", input.department.id, input.department.name),
    week: `${input.weekDates[0]} – ${input.weekDates.at(-1)}`,
    employees: input.employees.map((e) => ({
      code: code(e.id, e.name)!,
      weekly_norm_hours: e.weeklyNormMinutes === null ? null : e.weeklyNormMinutes / 60,
      under_18: e.under18,
      unavailable: e.availability
        .filter((a) => a.kind === "unavailable")
        .map((a) => `${a.date} ${a.from && a.to ? `${a.from}–${a.to}` : "hele dagen"}`),
      ...(e.availability.some((a) => a.kind === "available")
        ? {
            prefers: e.availability
              .filter((a) => a.kind === "available")
              .map((a) => `${a.date} ${a.from && a.to ? `${a.from}–${a.to}` : "hele dagen"}`),
          }
        : {}),
      absence: e.absences.map((a) => `${a.from}–${a.to} (${a.type})`),
    })),
    existing_shifts: input.existing.map((s) => ({
      employee: code(s.employeeId, names.get(s.employeeId ?? "") ?? ""),
      date: localParts(s.start).date,
      start: localParts(s.start).time,
      end: localParts(s.end).time,
      status: s.status,
    })),
    templates: input.templates.map((t) => ({
      name: t.name,
      start: t.start,
      end: t.end,
      unpaid_break_minutes: t.breakMinutes,
    })),
  };
}
