/** The public API (/api/v1): scopes, webhook events and request parameters. Pure. */
import { isValidIsoDate, type IsoDate } from "./civil-date";

export const API_SCOPES = [
  { key: "employees.read", label: "Læse medarbejdere, afdelinger og kontrakter" },
  { key: "employees.write", label: "Oprette og rette medarbejdere, afdelinger og kontrakter" },
  { key: "schedule.read", label: "Læse den offentliggjorte vagtplan" },
  { key: "time.read", label: "Læse registreret tid" },
  { key: "time.stamp", label: "Stemple ind og ud for medarbejdere (stempelur)" },
  { key: "absence.read", label: "Læse fravær og ferie" },
  { key: "payroll.read", label: "Læse lønperioder og lønlinjer" },
  { key: "posting.read", label: "Læse konteringsdimensioner og projekter" },
] as const;
export type ApiScope = (typeof API_SCOPES)[number]["key"];

export const WEBHOOK_EVENTS = [
  { key: "time_entry.approved", label: "Tid er godkendt" },
  { key: "pay_period.closed", label: "Lønperiode er afsluttet" },
  { key: "absence.decided", label: "Fravær er godkendt eller afvist" },
  { key: "schedule.published", label: "Vagtplan er offentliggjort" },
  { key: "employee.created", label: "Medarbejder er oprettet" },
  { key: "employee.updated", label: "Medarbejder er ændret" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"] | "ping";

export const MAX_RANGE_DAYS = 93;

const days = (a: IsoDate, b: IsoDate) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (both included). */
export function parseRange(q: URLSearchParams): { from: IsoDate; to: IsoDate } | { error: string } {
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!from || !to) return { error: "from and to (YYYY-MM-DD) are required" };
  if (!isValidIsoDate(from) || !isValidIsoDate(to))
    return { error: "from and to must be valid dates" };
  if (to < from) return { error: "to must not be before from" };
  if (days(from, to) > MAX_RANGE_DAYS)
    return { error: `at most ${MAX_RANGE_DAYS} days per request` };
  return { from, to };
}

/** ?limit=&offset= (limit 1–1000, default 100). */
export function parsePaging(q: URLSearchParams): { limit: number; offset: number } {
  const n = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : null);
  const limit = n(q.get("limit"));
  return {
    limit: limit === null || limit < 1 ? 100 : Math.min(limit, 1000),
    offset: n(q.get("offset")) ?? 0,
  };
}

/** Minutes until the next attempt after `attempt` failed attempts (as webhook_result). */
export const retryDelayMinutes = (attempt: number) => 2 ** (attempt - 1);

/**
 * Webhook URLs must be https and not point at the local machine or a private
 * network (by literal host). `allowInsecure` (tests, local development) also
 * allows http and local hosts.
 */
export function isAllowedWebhookUrl(raw: string, allowInsecure = false): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (allowInsecure) return url.protocol === "https:" || url.protocol === "http:";
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))
    return false;
  return true;
}
