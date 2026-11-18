import { z } from "zod";
import { da } from "@/lib/i18n/da";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { parseKroner } from "@/lib/domain/numbers";
import { parseKm } from "@/lib/domain/mileage";
import { jsonField, optionalGuid } from "./schedule";

const v = da.validation;
const text = (min: number, max: number) =>
  z.string().trim().min(min, v.required).max(max, v.tooLong);
const payCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9_]{1,32}$/, da.settings.payCodeInvalid));
const kroner = z.string().transform((s, ctx) => {
  const ore = parseKroner(s);
  if (ore === null || ore < 0) {
    ctx.addIssue({ code: "custom", message: v.invalidNumber });
    return z.NEVER;
  }
  return ore;
});
const isoDate = z.string().refine(isValidIsoDate, v.invalidDate);
/** {dimension id: value id} as JSON; empty means the defaults. */
const postingValues = z
  .string()
  .optional()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s || "{}") as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: v.required });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.guid(), z.guid()));

/** The km rates of one year, as entered by the consultant from the source. */
export const mileageRateSchema = z.object({
  year: z.coerce.number().int().min(2000, v.invalidNumber).max(2100, v.invalidNumber),
  high_rate: kroner,
  low_rate: kroner,
  high_limit_km: z.coerce.number().int().min(0, v.invalidNumber).max(1_000_000, v.invalidNumber),
  pay_code_high: payCode,
  pay_code_low: payCode,
  source: text(1, 300),
});

export const expenseCategorySchema = z.object({
  name: text(1, 80),
  pay_code: payCode,
  receipt_required: z
    .literal("on")
    .nullish()
    .transform((x) => x === "on"),
});

/** A trip in the logbook (kørselsregnskab). */
export const tripSchema = z.object({
  id: optionalGuid,
  trip_date: isoDate,
  purpose: text(3, 300),
  from_address: text(1, 200),
  to_address: text(1, 200),
  stops: jsonField(z.array(z.string().trim().min(1).max(200)).max(20)),
  km: z.string().transform((s, ctx) => {
    const m = parseKm(s);
    if (m === null || m > 10_000_000) {
      ctx.addIssue({ code: "custom", message: da.expenses.kmInvalid });
      return z.NEVER;
    }
    return m;
  }),
  vehicle: z
    .string()
    .trim()
    .max(40, v.tooLong)
    .optional()
    .transform((s) => s || null),
  posting: postingValues,
});

export const expenseSchema = z.object({
  id: optionalGuid,
  expense_date: isoDate,
  category_id: z.guid(v.required),
  description: text(3, 300),
  amount: kroner.refine((n) => n > 0, v.invalidNumber),
  posting: postingValues,
});

export const RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
