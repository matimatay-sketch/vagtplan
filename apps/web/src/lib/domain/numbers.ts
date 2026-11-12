/** Parses "37", "15,5" or "15.5". Thousands separators are not accepted. */
export function parseDanishDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  return Number(trimmed.replace(",", "."));
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

const hoursFormat = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function formatHours(minutes: number): string {
  return hoursFormat.format(minutes / 60);
}
