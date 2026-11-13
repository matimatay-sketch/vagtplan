import type { RuleLayer } from "@vagtplan/rules-engine";

export type Handling = "block" | "allow";
export type RuleHandlingMap = Partial<Record<string, Handling>>;

/** Violation codes the rules engine can produce, with Danish labels for the settings page. */
export const RULE_CATALOG = [
  { code: "REST_DAILY", label: "Daglig hviletid", severity: "BLOCKING", young: false },
  { code: "REST_WEEKLY", label: "Ugentligt fridøgn", severity: "BLOCKING", young: false },
  {
    code: "MAX_WEEKLY_AVERAGE",
    label: "48 timer i gennemsnit",
    severity: "BLOCKING",
    young: false,
  },
  { code: "BREAK_MISSING", label: "Pause", severity: "WARNING", young: false },
  { code: "YOUNG_MAX_DAILY", label: "Unge: timer pr. dag", severity: "BLOCKING", young: true },
  { code: "YOUNG_MAX_WEEKLY", label: "Unge: timer pr. uge", severity: "BLOCKING", young: true },
  { code: "YOUNG_BREAK", label: "Unge: pause", severity: "BLOCKING", young: true },
  { code: "MIN_SHIFT", label: "Minimum vagtlængde", severity: "WARNING", young: false },
  { code: "NIGHT_AVERAGE", label: "Natarbejde", severity: "WARNING", young: false },
  { code: "WEEKEND_OFF", label: "Fri weekender", severity: "WARNING", young: false },
  { code: "NOTICE_LATE", label: "For sent varslet", severity: "WARNING", young: false },
] as const;

/** "block" = needs an override with reason at publishing; "allow" = always flagged, overridden permanently. */
export function effectiveHandling(
  code: string,
  severity: "BLOCKING" | "WARNING",
  map: RuleHandlingMap,
): Handling {
  return map[code] ?? (severity === "BLOCKING" ? "block" : "allow");
}

export const PERMANENT_OVERRIDE_REASON = "Tilsidesat permanent i opsætningen";

/** Organization-wide rule layer from settings (currently notice). */
export function organizationLayerFrom(s: {
  notice_publish_hours: number | null;
  notice_change_hours: number | null;
}): { rules: RuleLayer[] } | null {
  const params: Record<string, number> = {};
  if (s.notice_publish_hours !== null) params.publish_notice_hours = s.notice_publish_hours;
  if (s.notice_change_hours !== null) params.change_notice_hours = s.notice_change_hours;
  if (Object.keys(params).length === 0) return null;
  return {
    rules: [
      {
        id: "varsling",
        primitive: "notice",
        label: "Varsling (opsætning)",
        source: "Virksomhedens opsætning",
        params,
      },
    ],
  };
}
