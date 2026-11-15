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

/** øre → "1.125,00" (Danish thousands separator and decimal comma; integer maths). */
export function formatKroner(ore: number): string {
  const abs = Math.abs(ore);
  const kr = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${ore < 0 ? "−" : ""}${kr},${String(abs % 100).padStart(2, "0")}`;
}

/** "1.200,50" → 120050 øre ("." as thousands separator, "," as decimal; max two decimals). */
export function parseKroner(input: string): number | null {
  const m = /^\s*([-−]?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const ore = Number(m[2]!.replaceAll(".", "")) * 100 + Number((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -ore : ore;
}
