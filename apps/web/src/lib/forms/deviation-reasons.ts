import { z } from "zod";
import { SITUATIONS } from "@/lib/domain/deviation";
import { parseDanishDecimal } from "@/lib/domain/numbers";
import { da } from "@/lib/i18n/da";

const t = da.deviationReasons;

/** A deviation reason from the settings form (repeated applies_to fields are a list). */
export const deviationReasonSchema = z
  .instanceof(FormData)
  .transform((fd) => ({
    name: String(fd.get("name") ?? ""),
    applies_to: fd.getAll("applies_to").map(String),
    treatment: String(fd.get("treatment") ?? ""),
    time_off_mode: String(fd.get("time_off_mode") ?? "agreement"),
    time_off_factor: String(fd.get("time_off_factor") ?? "1"),
    time_off_pay_code: String(fd.get("time_off_pay_code") ?? "")
      .trim()
      .toUpperCase(),
    absence_type: String(fd.get("absence_type") ?? "").trim(),
  }))
  .pipe(
    z
      .object({
        name: z.string().trim().min(1, da.validation.required).max(80, da.validation.tooLong),
        applies_to: z.array(z.enum(SITUATIONS)),
        treatment: z.enum(["none", "payout", "time_off", "absence"], t.treatmentRequired),
        time_off_mode: z.enum(["agreement", "factor"]),
        time_off_factor: z.string(),
        time_off_pay_code: z.string(),
        absence_type: z.string(),
      })
      .transform((v, ctx) => {
        const timeOff = v.treatment === "time_off";
        const byFactor = timeOff && v.time_off_mode === "factor";
        const factor = parseDanishDecimal(v.time_off_factor);
        if (v.applies_to.length === 0)
          ctx.addIssue({ code: "custom", path: ["applies_to"], message: t.appliesRequired });
        if (byFactor && (factor === null || factor > 10))
          ctx.addIssue({ code: "custom", path: ["time_off_factor"], message: t.factorInvalid });
        if (byFactor && !/^[A-Z0-9_]{1,32}$/.test(v.time_off_pay_code))
          ctx.addIssue({ code: "custom", path: ["time_off_pay_code"], message: t.payCodeRequired });
        if (v.treatment === "absence" && !/^[a-z_]+$/.test(v.absence_type))
          ctx.addIssue({ code: "custom", path: ["absence_type"], message: t.absenceRequired });
        return {
          name: v.name,
          applies_to: v.applies_to,
          treatment: v.treatment,
          time_off_mode: timeOff ? v.time_off_mode : ("agreement" as const),
          time_off_factor_bp: byFactor && factor !== null ? Math.round(factor * 10000) : 10000,
          time_off_pay_code: byFactor ? v.time_off_pay_code : null,
          absence_type: v.treatment === "absence" ? v.absence_type : null,
        };
      }),
  );

export const deviationThresholdSchema = z.object({
  deviation_threshold_minutes: z
    .string()
    .regex(/^\d{1,3}$/, t.thresholdInvalid)
    .transform(Number)
    .pipe(z.number().int().min(0, t.thresholdInvalid).max(240, t.thresholdInvalid)),
});
