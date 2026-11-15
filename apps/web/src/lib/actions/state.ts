import type { FieldErrors } from "@/lib/forms/schemas";

/** Result of a form server action, consumed with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Echo of submitted values so fields keep their content after an error. */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {};

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries())
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** Map well-known Postgres error codes to Danish messages. */
export function dbErrorMessage(
  error: { code?: string; message?: string } | null,
  overrides: Partial<Record<string, string>> = {},
): string {
  const code = error?.code ?? "";
  if (overrides[code]) return overrides[code]!;
  switch (code) {
    case "42501":
      return "Du har ikke adgang til dette.";
    case "23505":
      return "Findes allerede.";
    case "23P01":
      return "Overlapper en eksisterende periode.";
    case "23514":
      return "Værdien er ikke tilladt.";
    default:
      return "Noget gik galt. Prøv igen.";
  }
}
