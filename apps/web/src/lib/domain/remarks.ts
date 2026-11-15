/** Helpers for consultant-defined remarks (anmærkninger) on an agreement. Pure. */

export const CONDITION_TYPES = [
  "shift_longer_than",
  "shift_shorter_than",
  "starts_before",
  "ends_after",
  "consecutive_days",
  "weekly_hours",
  "break_below",
  "rest_below",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export type RemarkCondition =
  | { type: "shift_longer_than" | "shift_shorter_than"; minutes: number }
  | { type: "starts_before" | "ends_after"; time: string }
  | { type: "consecutive_days"; max_days: number }
  | { type: "weekly_hours"; max_minutes: number }
  | { type: "break_below"; shift_over_minutes: number; min_break_minutes: number }
  | { type: "rest_below"; min_minutes: number };

export type RemarkParams = {
  code: string;
  message: string;
  show_in: ("schedule" | "time")[];
  condition: RemarkCondition;
};

/** Starting values only; the consultant sets the real limit. */
export function defaultCondition(type: ConditionType): RemarkCondition {
  switch (type) {
    case "shift_longer_than":
    case "shift_shorter_than":
      return { type, minutes: 0 };
    case "starts_before":
    case "ends_after":
      return { type, time: "00:00" };
    case "consecutive_days":
      return { type, max_days: 1 };
    case "weekly_hours":
      return { type, max_minutes: 0 };
    case "break_below":
      return { type, shift_over_minutes: 0, min_break_minutes: 0 };
    case "rest_below":
      return { type, min_minutes: 0 };
  }
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function remarkId(name: string, existing: readonly string[]): string {
  const base = ["anm", slug(name)].filter(Boolean).join("-").slice(0, 56).replace(/-+$/, "");
  let id = base;
  for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`;
  return id;
}

export function newRemarkRule(
  name: string,
  existingIds: readonly string[],
  condition: RemarkCondition,
) {
  const id = remarkId(name, existingIds);
  return {
    id,
    primitive: "remark" as const,
    label: name,
    source: "Egen anmærkning",
    severity: "WARNING" as const,
    params: {
      code: id.toUpperCase().replace(/-/g, "_").slice(0, 32),
      message: name,
      show_in: ["schedule", "time"],
      condition,
    } satisfies RemarkParams,
  };
}
