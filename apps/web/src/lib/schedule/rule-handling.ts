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
  severity: "BLOCKING" | "WARNING" | "INFO",
  map: RuleHandlingMap,
): Handling {
  return map[code] ?? (severity === "BLOCKING" ? "block" : "allow");
}

export const PERMANENT_OVERRIDE_REASON = "Tilsidesat permanent i opsætningen";

/** Organization-wide rule layer from settings (currently notice). */
/** Leave and on-call rules set in the organization's settings (empty = follow the agreement). */
export type LeaveRules = {
  entitlement_proration?: "none" | "remaining_months";
  on_call_counts_as_rest?: boolean;
  leave_day_basis?: "weekdays" | "planned_days";
  transfer_allowed?: boolean;
  transfer_only_above_days?: number | null;
  payout_allowed?: boolean;
  payout_only_above_days?: number | null;
};

const ORG_SOURCE = "Virksomhedens opsætning";

/** The organization layer for the rules engine: notice and leave settings. */
export function organizationLayerFrom(s: {
  notice_publish_hours: number | null;
  notice_change_hours: number | null;
  leave_rules?: LeaveRules | null;
}): { rules: RuleLayer[] } | null {
  const rules: RuleLayer[] = [];
  const params: Record<string, number> = {};
  if (s.notice_publish_hours !== null) params.publish_notice_hours = s.notice_publish_hours;
  if (s.notice_change_hours !== null) params.change_notice_hours = s.notice_change_hours;
  if (Object.keys(params).length > 0)
    rules.push({
      id: "varsling",
      primitive: "notice",
      label: "Varsling (opsætning)",
      source: ORG_SOURCE,
      params,
    });

  const l = s.leave_rules ?? {};
  const merge = (id: string, primitive: RuleLayer["primitive"], p: Record<string, unknown>) => {
    if (Object.keys(p).length)
      rules.push({ id, primitive, merge_into: "primitive", source: ORG_SOURCE, params: p });
  };
  merge("org-fravaer", "absence", {
    ...(l.entitlement_proration ? { entitlement_proration: l.entitlement_proration } : {}),
  });
  merge("org-raadighed", "on_call", {
    ...(l.on_call_counts_as_rest !== undefined ? { counts_as_rest: l.on_call_counts_as_rest } : {}),
  });
  merge("org-ferie", "vacation", {
    ...(l.leave_day_basis ? { leave_day_basis: l.leave_day_basis } : {}),
    ...(l.transfer_allowed !== undefined
      ? {
          transfer: {
            allowed: l.transfer_allowed,
            only_above_days: l.transfer_only_above_days ?? null,
          },
        }
      : {}),
    ...(l.payout_allowed !== undefined
      ? { payout: { allowed: l.payout_allowed, only_above_days: l.payout_only_above_days ?? null } }
      : {}),
  });
  return rules.length ? { rules } : null;
}
