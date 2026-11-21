import { formatHours } from "@/lib/domain/numbers";

const dateFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO calendar date ("2026-11-12") as "12. nov. 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}

export function formatWeeklyHours(minutes: number): string {
  return `${formatHours(minutes)} t/uge`;
}

export function fullName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`;
}

const dateTimeFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Copenhagen",
});

/** An instant as "27. nov. 14.05" in Copenhagen time. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
