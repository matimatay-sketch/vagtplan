import type { DeviationReason } from "@/lib/domain/deviation";

export type ReasonOption = Pick<DeviationReason, "id" | "name" | "applies_to">;
/** The organization's deviation reasons in use and the threshold for asking (minutes). */
export type DeviationContext = { reasons: ReasonOption[]; thresholdMinutes: number };
