import { z } from "zod";

/**
 * Agreement documents (overenskomster) and their rule primitives.
 *
 * Units: money in øre (integers), percentages in basis points (1 % = 100 bp),
 * durations in minutes, clock times as local "HH:MM" ("24:00" allowed as end).
 *
 * A document is a *layer*: it may introduce complete rules or override fields
 * of inherited rules (matched by rule id). The merged result is validated
 * with the strict per-primitive schemas in `ruleSchemas`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "expected HH:MM");
const hhmmDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected MM-DD");
const minutes = z.number().int().min(0);
const ore = z.number().int().min(0);
const bp = z.number().int().min(0);
const payCode = z.string().regex(/^[A-Z0-9_]{1,32}$/, "pay codes are UPPER_SNAKE");

export const amountSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ore_per_hour"), ore }),
  z.object({ type: z.literal("percent_of_base"), bp }),
]);
export type Amount = z.infer<typeof amountSchema>;

export const DAY_SELECTORS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "weekday",
  "holiday",
  "any",
] as const;
export type DaySelector = (typeof DAY_SELECTORS)[number];

/** INFO is only shown (used by remarks); WARNING is shown clearly; BLOCKING needs an override. */
export const SEVERITIES = ["BLOCKING", "WARNING", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Primitive parameter schemas
// ---------------------------------------------------------------------------
/**
 * A time window on given days. Optionally only for shifts that started at or
 * before / after a local time on the window's day (e.g. Monday 04–06 for a
 * shift begun no later than 00:00 Monday, i.e. on Sunday).
 */
export const windowSchema = z.object({
  days: z.array(z.enum(DAY_SELECTORS)).min(1),
  from: hhmm,
  to: hhmm,
  started_at_or_before: hhmmDay.nullable().default(null),
  started_after: hhmmDay.nullable().default(null),
});
export type TimeWindow = z.output<typeof windowSchema>;

/** started: per begun unit; completed: per whole unit; nearest: to the nearest unit. */
export const roundingSchema = z.object({
  unit_minutes: z.number().int().min(1).max(240),
  mode: z.enum(["started", "completed", "nearest"]),
});
export type QuantityRounding = z.output<typeof roundingSchema>;

export const ruleSchemas = {
  /** Lønsats: base hourly rate by staff group / pay step / age, date-dependent. */
  pay_rate: z.object({
    pay_code: payCode,
    rates: z
      .array(
        z.object({
          staff_group: z.string().nullable().default(null),
          pay_step: z.string().nullable().default(null),
          min_age: z.number().int().nullable().default(null),
          /** Exclusive upper bound. */
          max_age: z.number().int().nullable().default(null),
          valid_from: isoDate.nullable().default(null),
          valid_to: isoDate.nullable().default(null),
          hourly_ore: ore,
        }),
      )
      .min(1),
  }),

  /** NormTid: the norm used to find overtime. Weekly norm comes from the contract. */
  norm: z.object({
    period: z.discriminatedUnion("type", [
      z.object({ type: z.literal("week") }),
      z.object({
        type: z.literal("weeks"),
        weeks: z.number().int().min(2).max(52),
        anchor: isoDate,
      }),
    ]),
    daily_minutes: minutes.nullable().default(null),
    part_time_min_weekly_minutes: minutes.nullable().default(null),
    part_time_max_weekly_minutes: minutes.nullable().default(null),
  }),

  /** Overarbejde. Tiers count within the trigger unit (day, week or norm period). */
  overtime: z.object({
    trigger: z.enum(["daily_norm", "weekly_norm", "period_norm", "outside_planned"]),
    tiers: z
      .array(
        z.object({ up_to_minutes: minutes.nullable(), amount: amountSchema, pay_code: payCode }),
      )
      .min(1)
      .refine(
        (t) => t.slice(0, -1).every((x) => x.up_to_minutes !== null),
        "only the last tier may be open-ended",
      ),
    compensation: z.enum(["payout", "time_off"]).default("payout"),
    /** Time off per overtime minute, in bp (15000 = 1.5 minutes). */
    time_off_factor_bp: bp.default(10000),
    /** Monthly paid staff get the hourly base on top of the supplement. */
    monthly_paid_includes_base: z.boolean().default(true),
  }),

  /** Tidsvinduestillæg, e.g. evening/night/weekend/holiday supplements. */
  time_window_supplement: z.object({
    windows: z.array(windowSchema).min(1),
    /** Weekday selectors do not match holiday time (holiday has its own selector). */
    exclude_holidays: z.boolean().default(true),
    amount: amountSchema,
    pay_code: payCode,
    /** Not paid for overtime minutes (when the agreement says so). */
    exclude_overtime: z.boolean().default(false),
    /** Not paid for call-out time (paid as overtime under on-call in some agreements). */
    exclude_call_out: z.boolean().default(false),
    /** Supplement time is rounded per shift (e.g. paid per half hour). null = per minute. */
    rounding: roundingSchema.nullable().default(null),
  }),

  /** Helligdagskalender: which days are holidays, and half days. */
  holiday_calendar: z.object({
    holidays: z.array(z.string()).default([]),
    partial: z.array(z.object({ key: z.string(), from: hhmm })).default([]),
  }),

  /** Pause: required when daily work exceeds after_minutes. */
  break: z.object({
    after_minutes: minutes,
    min_minutes: minutes.nullable(),
    paid: z.boolean(),
    /**
     * Paid breaks count as working time in the working-time rules (daily and
     * weekly limits, averages). Unpaid breaks never do.
     */
    paid_counts_as_working_time: z.boolean().default(true),
  }),

  /** Hviletid og fridøgn. */
  rest: z.object({
    daily_minutes: minutes,
    weekly_minutes: minutes,
    weekly_period: z.enum(["calendar_week", "rolling_7_days"]),
  }),

  /** Gennemsnitlig ugentlig arbejdstid over en referenceperiode. */
  max_weekly_average: z.object({
    max_average_minutes: minutes,
    warning_average_minutes: minutes,
    reference_months: z.number().int().min(1).max(12),
    reference_anchor: monthDay,
  }),

  /** Minimum vagtlængde og evt. garantibetaling. */
  min_shift: z.object({
    min_minutes: minutes,
    guarantee_pay: z.boolean(),
    pay_code: payCode,
  }),

  /** Natarbejde. */
  night_work: z.object({
    from: hhmm,
    to: hhmm,
    /** A shift with at least this much night time is a night shift. */
    night_shift_min_minutes: minutes,
    max_average_daily_minutes: minutes,
    reference_days: z.number().int().min(1),
  }),

  /** Afrunding af stemplinger. */
  rounding: z.object({
    unit_minutes: z.number().int().min(1).max(60),
    start: z.enum(["nearest", "up", "down"]),
    end: z.enum(["nearest", "up", "down"]),
    snap_before_start_minutes: minutes.default(0),
    snap_after_end_minutes: minutes.default(0),
  }),

  /** Skærpede regler for unge under 18. First matching group applies. */
  young_worker: z.object({
    groups: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          applies: z.object({
            min_age: z.number().int().nullable().default(null),
            /** Exclusive. */
            max_age: z.number().int().nullable().default(null),
            school_obligated: z.boolean().nullable().default(null),
          }),
          max_daily_minutes: minutes.nullable().default(null),
          max_daily_minutes_school_day: minutes.nullable().default(null),
          max_weekly_minutes: minutes.nullable().default(null),
          min_rest_minutes: minutes.nullable().default(null),
          break_after_minutes: minutes.nullable().default(null),
          break_min_minutes: minutes.nullable().default(null),
        }),
      )
      .min(1),
  }),

  /** Rådighed og tilkald. */
  on_call: z.object({
    amount: amountSchema,
    pay_code: payCode,
    call_out_min_minutes: minutes,
    call_out_guarantee_pay_code: payCode,
    /** On-call time without a call-out counts as rest (true) or as work (false) for the rest rules. */
    counts_as_rest: z.boolean().default(true),
    /** Other rates in time windows (first match wins); other on-call time uses amount/pay_code. */
    rate_windows: z
      .array(windowSchema.extend({ amount: amountSchema, pay_code: payCode }))
      .default([]),
    /** Weekday/day windows do not match holiday time (the holiday selector does). */
    exclude_holidays: z.boolean().default(true),
    /** On-call time rounded per on-call shift and rate (e.g. per begun half hour). */
    rounding: roundingSchema.nullable().default(null),
    /**
     * Extra pay for on-call hours above limits in a calendar month, in % of the
     * on-call rate. On-call and call-out minutes both count towards the limits;
     * only on-call minutes get the extra. Include the whole month in the input.
     */
    monthly_tiers: z
      .array(
        z.object({
          from_minutes: minutes,
          to_minutes: minutes.nullable(),
          percent_bp: bp,
          pay_code: payCode,
        }),
      )
      .default([]),
    /** Pay for call-out time, rounded per call-out (e.g. per begun hour), optionally capped. */
    call_out_pay: z
      .object({
        amount: amountSchema,
        pay_code: payCode,
        unit_minutes: z.number().int().min(1).max(240).default(60),
        max_rate_ore: ore.nullable().default(null),
      })
      .nullable()
      .default(null),
  }),

  /** Fravær. */
  absence: z.object({
    types: z
      .array(
        z.object({
          code: z.string().regex(/^[a-z_]+$/),
          label: z.string(),
          payment: z.enum(["full", "none"]),
          pay_code: payCode.nullable(),
          /** Absence minutes count towards the norm when finding overtime. */
          counts_towards_norm: z.boolean(),
          entitlement: z
            .object({
              days: z.number().min(0),
              period: z.enum(["calendar_year", "holiday_year"]),
              accrual: z.enum(["upfront", "monthly"]),
            })
            .nullable()
            .default(null),
        }),
      )
      .min(1),
    /**
     * Upfront entitlements for someone who starts during the period: the full
     * number of days ("none") or a share for the months left ("remaining_months").
     */
    entitlement_proration: z.enum(["none", "remaining_months"]).default("none"),
  }),

  /** Ferie (ferieloven) + evt. feriefridage. null bp = TODO(jura), not yet configured. */
  vacation: z.object({
    days_per_month: z.number().min(0),
    holiday_year_start: monthDay,
    usage_extends_months: z.number().int().min(0),
    main_holiday: z.object({
      min_consecutive_days: z.number().int().min(0),
      from: monthDay,
      to: monthDay,
    }),
    vacation_pay_bp: bp.nullable(),
    vacation_supplement_bp: bp.nullable(),
    special_vacation_pay_bp: bp.nullable(),
    extra_days: z
      .object({
        days_per_year: z.number().min(0),
        year_start: monthDay,
        accrual: z.enum(["upfront", "monthly"]),
      })
      .nullable()
      .default(null),
    /**
     * Which days count as leave days: Monday–Friday without holidays, or only
     * the days the employee was planned to work (part-time with fewer days).
     */
    leave_day_basis: z.enum(["weekdays", "planned_days"]).default("weekdays"),
    /** Transfer to the next holiday year: allowed, and only days above this many (e.g. 20 = four weeks). */
    transfer: z
      .object({ allowed: z.boolean(), only_above_days: z.number().min(0).nullable() })
      .default({ allowed: true, only_above_days: null }),
    /** Payout: allowed, and only days above this many. */
    payout: z
      .object({ allowed: z.boolean(), only_above_days: z.number().min(0).nullable() })
      .default({ allowed: true, only_above_days: null }),
  }),

  /** Varsling: how early a schedule (or a change to it) must be published. */
  notice: z.object({
    /** Use days or hours (hours win when both are set). */
    publish_notice_days: z.number().int().min(0).nullable().default(null),
    publish_notice_hours: z.number().int().min(0).nullable().default(null),
    change_notice_hours: z.number().int().min(0).nullable().default(null),
  }),

  /** Weekendfri: at least N free weekends (Sat 00:00 – Mon 00:00) per M weeks. */
  weekend_off: z.object({
    weekends_off: z.number().int().min(0),
    per_weeks: z.number().int().min(1).max(52),
  }),

  /**
   * Optjening af frihed: time off earned as lines of time-off minutes (no
   * money), e.g. 3 hours per 37 hours worked on 2nd/3rd shift, or a
   * replacement day for work on a public holiday.
   */
  time_off_accrual: z.object({
    pay_code: payCode,
    basis: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("worked_in_windows"),
        windows: z.array(windowSchema).min(1),
        exclude_holidays: z.boolean().default(false),
        /** Earn earn_minutes per per_minutes worked inside the windows (exact ratio). */
        per_minutes: z.number().int().min(1),
        earn_minutes: z.number().int().min(1),
        exclude_overtime: z.boolean().default(false),
      }),
      z.object({
        type: z.literal("holiday_work"),
        /** Time off per public holiday with work. */
        earn_minutes: z.number().int().min(1),
      }),
    ]),
  }),

  /**
   * Anmærkning: a remark the consultant defines (name, text, limit, severity),
   * shown on the schedule and/or on registered time. Severity comes from the
   * rule (default WARNING); several remark rules may exist side by side.
   */
  remark: z.object({
    /** Violation code, unique per agreement. */
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, "codes are UPPER_SNAKE"),
    message: z.string().trim().min(1),
    show_in: z
      .array(z.enum(["schedule", "time"]))
      .min(1)
      .default(["schedule", "time"]),
    condition: z.discriminatedUnion("type", [
      /** Start to end, breaks included. */
      z.object({ type: z.literal("shift_longer_than"), minutes }),
      z.object({ type: z.literal("shift_shorter_than"), minutes }),
      /** Local time on the shift's start day. */
      z.object({ type: z.literal("starts_before"), time: hhmmDay }),
      z.object({ type: z.literal("ends_after"), time: hhmmDay }),
      /** Working days in a row; flagged from day max_days + 1. */
      z.object({ type: z.literal("consecutive_days"), max_days: z.number().int().min(1) }),
      /** Working time (Mon–Sun) over the limit. */
      z.object({ type: z.literal("weekly_hours"), max_minutes: minutes }),
      /** A shift longer than shift_over_minutes with less break than min_break_minutes. */
      z.object({
        type: z.literal("break_below"),
        shift_over_minutes: minutes,
        min_break_minutes: minutes,
      }),
      /** Less rest than min_minutes between two shifts. */
      z.object({ type: z.literal("rest_below"), min_minutes: minutes }),
    ]),
  }),
} as const;

export type Primitive = keyof typeof ruleSchemas;
export const PRIMITIVES = Object.keys(ruleSchemas) as Primitive[];
export type ParamsOf<P extends Primitive> = z.output<(typeof ruleSchemas)[P]>;

const stackingSchema = z.object({
  mode: z.enum(["additive", "highest", "exclusive"]).default("additive"),
  group: z.string().nullable().default(null),
  replaces: z.array(z.string()).default([]),
});
export type Stacking = z.output<typeof stackingSchema>;

const appliesToSchema = z.object({
  staff_groups: z.array(z.string()).nullable().default(null),
  pay_forms: z
    .array(z.enum(["hourly", "monthly"]))
    .nullable()
    .default(null),
});

const ruleId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "rule ids are kebab-case");

/** A rule as written in a layer: everything but `id` may be partial. */
export const ruleLayerSchema = z
  .object({
    id: ruleId,
    primitive: z.enum(PRIMITIVES as [Primitive, ...Primitive[]]).optional(),
    remove: z.literal(true).optional(),
    label: z.string().optional(),
    source: z.string().optional(),
    legal_basis: z.string().nullable().optional(),
    todo_jura: z.string().nullable().optional(),
    severity: z.enum(SEVERITIES).optional(),
    priority: z.number().int().optional(),
    stacking: z.record(z.string(), z.unknown()).optional(),
    applies_to: z.record(z.string(), z.unknown()).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    /**
     * "primitive": merge into every existing rule of `primitive`, whatever its
     * id (used by organization settings). Creates nothing if none exists.
     */
    merge_into: z.literal("primitive").optional(),
  })
  .strict();
export type RuleLayer = z.infer<typeof ruleLayerSchema>;

/** A complete, merged rule. */
export function finalRuleSchema<P extends Primitive>(primitive: P) {
  return z
    .object({
      id: ruleId,
      primitive: z.literal(primitive),
      label: z.string().nullable().default(null),
      source: z.string().min(1, "every rule needs a source"),
      legal_basis: z.string().nullable().default(null),
      todo_jura: z.string().nullable().default(null),
      severity: z.enum(SEVERITIES).nullable().default(null),
      priority: z.number().int().default(0),
      stacking: stackingSchema.default({ mode: "additive", group: null, replaces: [] }),
      applies_to: appliesToSchema.default({ staff_groups: null, pay_forms: null }),
      params: ruleSchemas[primitive],
    })
    .strict();
}

export type Rule<P extends Primitive = Primitive> = {
  [K in P]: {
    id: string;
    primitive: K;
    label: string | null;
    source: string;
    legal_basis: string | null;
    todo_jura: string | null;
    severity: Severity | null;
    priority: number;
    stacking: Stacking;
    applies_to: { staff_groups: string[] | null; pay_forms: ("hourly" | "monthly")[] | null };
    params: ParamsOf<K>;
  };
}[P];

export const agreementDocumentSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    name: z.string().min(1),
    kind: z.enum(["base", "agreement", "local", "contract"]),
    version: z.number().int().min(1),
    valid_from: isoDate,
    valid_to: isoDate.nullable(),
    inherits_from: z.string().nullable(),
    source: z.string().min(1),
    /** Example documents carry fictitious rates and must never be used for payroll. */
    example: z.boolean().default(false),
    description: z.string().optional(),
    pay_codes: z.record(payCode, z.object({ label: z.string() })).default({}),
    rules: z.array(ruleLayerSchema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.rules.forEach((r, i) => {
      if (seen.has(r.id))
        ctx.addIssue({
          code: "custom",
          path: ["rules", i, "id"],
          message: `duplicate rule id ${r.id}`,
        });
      seen.add(r.id);
    });
    if (doc.valid_to && doc.valid_to < doc.valid_from) {
      ctx.addIssue({ code: "custom", path: ["valid_to"], message: "valid_to before valid_from" });
    }
  });
export type AgreementDocument = z.infer<typeof agreementDocumentSchema>;

export function parseAgreementDocument(input: unknown): AgreementDocument {
  const r = agreementDocumentSchema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid agreement document: ${issues}`);
  }
  return r.data;
}
