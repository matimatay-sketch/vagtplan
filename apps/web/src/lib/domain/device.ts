/**
 * Rough phone detection from request headers, used only to pick a sensible
 * default view (the user can always switch). Prefers the Client Hint
 * `Sec-CH-UA-Mobile`, falls back to the user agent. Pure.
 */
export function isPhoneRequest(h: { get(name: string): string | null }): boolean {
  const hint = h.get("sec-ch-ua-mobile");
  if (hint === "?1") return true;
  if (hint === "?0") return false;
  const ua = h.get("user-agent") ?? "";
  // iPads report as Macintosh; tablets without "Mobile" keep the week view.
  return /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua);
}
