/**
 * Forms from the rules engine's parameter schemas, so every rule can be
 * edited with fields instead of JSON. Also the holiday calendar as a list of
 * days to tick, and the rules a document inherits. Pure.
 */
import {
  HOLIDAY_DEFINITIONS,
  resolveAgreement,
  type AgreementRegistry,
} from "@vagtplan/rules-engine";

/** A Zod 4 schema, read structurally (the engine may carry its own copy of Zod). */
export type Schema = {
  _zod: { def: { type: string } };
  safeParse(v: unknown): { success: boolean; data?: unknown };
};

export type StringFormat = "text" | "date" | "time" | "month_day" | "pay_code";
export type SchemaNode =
  | { kind: "object"; fields: [string, Schema][] }
  | { kind: "array"; element: Schema }
  | { kind: "enum"; values: string[] }
  | { kind: "union"; discriminator: string; options: { value: string; schema: Schema }[] }
  | { kind: "literal"; value: unknown }
  | { kind: "boolean" }
  | { kind: "number"; int: boolean }
  | { kind: "string"; format: StringFormat }
  | { kind: "unknown" };

const WRAPPERS = ["default", "nullable", "optional", "prefault", "pipe"];

/** The schema without default/nullable/optional wrappers, and whether null is allowed. */
type Def = Record<string, unknown> & { type: string };
const defOf = (s: Schema) => s._zod.def as Def;

export function unwrap(schema: Schema): { schema: Schema; nullable: boolean } {
  let s = schema;
  let nullable = false;
  while (WRAPPERS.includes(defOf(s).type)) {
    const def = defOf(s);
    if (def.type === "nullable") nullable = true;
    s = (def.type === "pipe" ? def.in : def.innerType) as Schema;
  }
  return { schema: s, nullable };
}

const ok = (s: Schema, v: unknown) => s.safeParse(v).success;

function stringFormat(s: Schema): StringFormat {
  if (ok(s, "x")) return "text";
  if (ok(s, "2026-01-31")) return "date";
  if (ok(s, "12:00")) return "time";
  if (ok(s, "01-31")) return "month_day";
  if (ok(s, "ABC_1") && !ok(s, "abc")) return "pay_code";
  return "text";
}

export function describeSchema(schema: Schema): SchemaNode {
  const { schema: s } = unwrap(schema);
  const def = defOf(s);
  switch (def.type) {
    case "object":
      return { kind: "object", fields: Object.entries(def.shape as Record<string, Schema>) };
    case "array":
      return { kind: "array", element: def.element as Schema };
    case "enum":
      return { kind: "enum", values: Object.values(def.entries as Record<string, string>) };
    case "union": {
      const options = def.options as Schema[];
      const discriminator = (def.discriminator as string | undefined) ?? "type";
      return {
        kind: "union",
        discriminator,
        options: options.map((o) => {
          const shape = defOf(unwrap(o).schema).shape as Record<string, Schema>;
          const lit = defOf(unwrap(shape[discriminator]!).schema).values as unknown[];
          return { value: String(lit[0]), schema: o };
        }),
      };
    }
    case "literal":
      return { kind: "literal", value: (def.values as unknown[])[0] };
    case "boolean":
      return { kind: "boolean" };
    case "number":
      return { kind: "number", int: !ok(s, 0.5) };
    case "string":
      return { kind: "string", format: stringFormat(s) };
    default:
      return { kind: "unknown" };
  }
}

/**
 * A starting value: the schema's default, null where allowed, otherwise empty
 * (0, "", false, the first choice). Never a rate or limit from an agreement.
 */
export function initialValue(schema: Schema): unknown {
  const d = schema.safeParse(undefined);
  if (d.success) return d.data;
  if (unwrap(schema).nullable) return null;
  const node = describeSchema(schema);
  switch (node.kind) {
    case "object":
      return Object.fromEntries(node.fields.map(([k, f]) => [k, initialValue(f)]));
    case "array":
      return [];
    case "enum":
      return node.values[0];
    case "union":
      return initialValue(node.options[0]!.schema);
    case "literal":
      return node.value;
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string":
      return "";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Holiday calendar
// ---------------------------------------------------------------------------
export type HolidayParams = { holidays: string[]; partial?: { key: string; from: string }[] };
export type HolidayRow = {
  key: string;
  /** This year's date, or null when the day is not a holiday that year (abolished). */
  date: string | null;
  on: boolean;
  /** Half day: a holiday from this local time. null = the whole day. */
  from: string | null;
};

/** Every known day, in date order for the year; days without a date last. */
export function holidayRows(params: HolidayParams, year: number): HolidayRow[] {
  return Object.entries(HOLIDAY_DEFINITIONS)
    .map(([key, def]) => ({
      key,
      date: def(year),
      on: params.holidays.includes(key),
      from: params.partial?.find((p) => p.key === key)?.from ?? null,
    }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

/** Ticks or unticks a day; `from` makes it a half day (null = whole day, undefined = as is). */
export function setHoliday(
  params: HolidayParams,
  key: string,
  change: { on: boolean; from?: string | null },
): { holidays: string[]; partial: { key: string; from: string }[] } {
  const partial = params.partial ?? [];
  if (!change.on)
    return {
      holidays: params.holidays.filter((k) => k !== key),
      partial: partial.filter((p) => p.key !== key),
    };
  const holidays = params.holidays.includes(key) ? params.holidays : [...params.holidays, key];
  if (change.from === undefined) return { holidays, partial };
  const others = partial.filter((p) => p.key !== key);
  return {
    holidays,
    partial: change.from === null ? others : [...others, { key, from: change.from }],
  };
}

// ---------------------------------------------------------------------------
// Inherited rules
// ---------------------------------------------------------------------------
export type InheritedRule = {
  primitive: string;
  label: string | null;
  source: string;
  params: Record<string, unknown>;
};

/**
 * The merged rules of the document's parent on its start date, by rule id: a
 * rule in the document with the same id changes the inherited one.
 */
export function inheritedRules(
  registry: AgreementRegistry,
  doc: { inherits_from?: string | null; valid_from: string },
): Record<string, InheritedRule> {
  if (!doc.inherits_from) return {};
  try {
    const resolved = resolveAgreement(registry, {
      agreementId: doc.inherits_from,
      date: doc.valid_from,
    });
    return Object.fromEntries(
      resolved.rules.map((r) => [
        r.id,
        {
          primitive: r.primitive,
          label: r.label,
          source: r.source,
          params: r.params as Record<string, unknown>,
        },
      ]),
    );
  } catch {
    return {};
  }
}
