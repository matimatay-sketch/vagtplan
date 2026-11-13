/** CSV for Danish spreadsheets: semicolon separator, CRLF, UTF-8 BOM. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
