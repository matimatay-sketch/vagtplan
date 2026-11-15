/** "10 t 59 min", "11 t", "45 min" – Danish duration text. */
export function formatMinutes(total: number): string {
  const sign = total < 0 ? "-" : "";
  const m = Math.abs(Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${sign}${rest} min`;
  return rest === 0 ? `${sign}${h} t` : `${sign}${h} t ${rest} min`;
}
