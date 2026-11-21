import { z } from "zod";
import { da } from "@/lib/i18n/da";

const body = z.string().trim().min(1, da.validation.required).max(4000, da.validation.tooLong);

/** New conversation. `to` holds one or more user ids (checkboxes). */
export const newMessageSchema = z.object({
  to: z.array(z.guid()).min(1, da.messages.chooseRecipient),
  subject: z.string().trim().max(120, da.validation.tooLong).optional().default(""),
  body,
});

export const replySchema = z.object({ conversation_id: z.guid(), body });

export const editMessageSchema = z.object({ id: z.guid(), body });

export const swapSchema = z.object({
  shift_id: z.guid(),
  target_employee_id: z.guid({ message: da.swap.chooseColleague }),
  target_shift_id: z
    .union([z.guid(), z.literal("")])
    .optional()
    .transform((v) => v || null),
  note: z.string().trim().max(1000, da.validation.tooLong).optional().default(""),
});

export const cancellationSchema = z.object({
  shift_id: z.guid(),
  reason: z.string().trim().min(1, da.validation.required).max(1000, da.validation.tooLong),
});

export const swapDecisionSchema = z.object({
  id: z.guid(),
  decision: z.enum(["accept", "decline", "approve", "reject", "cancel"]),
  note: z.string().trim().max(1000, da.validation.tooLong).optional().default(""),
});
