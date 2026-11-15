import { z } from "zod";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";

const time = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(s), da.schedule.invalidTime);

export const availabilitySchema = (today: string) =>
  z
    .object({
      date: z
        .string()
        .refine(isValidIsoDate, da.validation.invalidDate)
        .refine((d) => d >= today, da.availability.pastDate),
      kind: z.enum(["unavailable", "available", "wish_off", "wish_work"]),
      from_time: time,
      to_time: time,
      note: z
        .string()
        .trim()
        .max(300, da.validation.tooLong)
        .optional()
        .transform((s) => (s ? s : null)),
    })
    .superRefine((v, ctx) => {
      if ((v.from_time === null) !== (v.to_time === null)) {
        ctx.addIssue({ code: "custom", path: ["to_time"], message: da.availability.bothTimes });
      } else if (v.from_time && v.to_time && v.from_time >= v.to_time) {
        ctx.addIssue({ code: "custom", path: ["to_time"], message: da.validation.endBeforeStart });
      }
    });
