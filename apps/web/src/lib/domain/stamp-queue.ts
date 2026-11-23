/**
 * Offline queue for stamping. Each action gets a client UUID when the button
 * is pressed, so replaying the queue never creates duplicates (the server's
 * `stamp` RPC is idempotent per client UUID). Browser-safe and pure.
 */
export type QueuedStamp = {
  clientId: string;
  action: "in" | "out";
  /** Device time when the button was pressed (ISO). */
  at: string;
  organizationId: string;
  /** The employee who stamped (another user on the device must never send it). */
  employeeId?: string;
  /** Posting chosen when stamping in (dimension id → value id); omitted = as planned/standard. */
  posting?: Record<string, string>;
  /** Deviation reason chosen when stamping (start: in or without a shift; end: out). */
  reasonId?: string;
  reasonAt?: "start" | "end";
};

export type StampResult =
  { clientId: string; status: "ok" } | { clientId: string; status: "rejected"; reason: string };

export const QUEUE_KEY = "turnus.stamp-queue";

function isQueued(x: unknown): x is QueuedStamp {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.clientId === "string" &&
    (o.action === "in" || o.action === "out") &&
    typeof o.at === "string" &&
    typeof o.organizationId === "string" &&
    (o.employeeId === undefined || typeof o.employeeId === "string") &&
    (o.posting === undefined || (typeof o.posting === "object" && o.posting !== null))
  );
}

export function parseQueue(raw: string | null): QueuedStamp[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isQueued) : [];
  } catch {
    return [];
  }
}

export function enqueue(queue: readonly QueuedStamp[], item: QueuedStamp): QueuedStamp[] {
  return queue.some((x) => x.clientId === item.clientId) ? [...queue] : [...queue, item];
}

/** Synced and rejected items leave the queue; items without a result stay. */
export function applyResults(
  queue: readonly QueuedStamp[],
  results: readonly StampResult[],
): { remaining: QueuedStamp[]; rejected: { clientId: string; reason: string }[] } {
  const done = new Map(results.map((r) => [r.clientId, r]));
  return {
    remaining: queue.filter((x) => !done.has(x.clientId)),
    rejected: results.flatMap((r) =>
      r.status === "rejected" ? [{ clientId: r.clientId, reason: r.reason }] : [],
    ),
  };
}

/** The queued stamps of this employee (stamps saved before employeeId was stored count too). */
export const forOwner = (
  queue: readonly QueuedStamp[],
  organizationId: string,
  employeeId?: string,
) =>
  queue.filter(
    (x) =>
      x.organizationId === organizationId &&
      (x.employeeId === undefined || employeeId === undefined || x.employeeId === employeeId),
  );

/** What to show: the server state with the queued actions applied on top. */
export function stampState(
  server: { openSince: string | null },
  queue: readonly QueuedStamp[],
  organizationId: string,
  employeeId?: string,
): { in: boolean; since: string | null; pending: number } {
  let since = server.openSince;
  const mine = forOwner(queue, organizationId, employeeId);
  for (const x of mine) since = x.action === "in" ? x.at : null;
  return { in: since !== null, since, pending: mine.length };
}
