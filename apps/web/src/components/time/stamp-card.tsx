"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { PostingDimension } from "@/lib/domain/posting";
import { syncStampsAction } from "@/lib/actions/time";
import {
  QUEUE_KEY,
  applyResults,
  enqueue,
  parseQueue,
  stampState,
  type QueuedStamp,
} from "@/lib/domain/stamp-queue";
import { localParts } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

// localStorage-backed queue shared by all stamp cards in the tab.
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedQueue: QueuedStamp[] = [];
function readQueue(): QueuedStamp[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(QUEUE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedQueue = parseQueue(raw);
  }
  return cachedQueue;
}
function writeQueue(q: QueuedStamp[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // Private mode: the queue only lives in memory.
    cachedRaw = JSON.stringify(q);
    cachedQueue = q;
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === QUEUE_KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
};
const EMPTY: QueuedStamp[] = [];

export function StampCard({
  organizationId,
  openSince,
  disabled,
  posting = [],
}: {
  organizationId: string;
  /** Start of the open registration on the server, if stamped in. */
  openSince: string | null;
  disabled?: boolean;
  /** Posting the employee may choose when stamping in (values available to them). */
  posting?: PostingDimension[];
}) {
  const t = da.time;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const router = useRouter();
  const queue = useSyncExternalStore(subscribe, readQueue, () => EMPTY);
  const state = stampState({ openSince }, queue, organizationId);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const syncing = useRef(false);

  const flush = useCallback(async () => {
    if (syncing.current) return;
    const pending = readQueue().filter((x) => x.organizationId === organizationId);
    if (pending.length === 0) return;
    syncing.current = true;
    try {
      const results = await syncStampsAction(pending);
      const { remaining, rejected } = applyResults(readQueue(), results);
      writeQueue(remaining);
      if (rejected.length)
        setMessage({ text: t.rejected[rejected[0]!.reason] ?? t.rejected.unknown!, tone: "error" });
      else if (results.length) setMessage({ text: t.synced, tone: "info" });
      if (results.length) router.refresh();
    } catch {
      // Offline or the server could not be reached: keep the queue.
      setMessage({ text: t.savedOffline, tone: "info" });
    } finally {
      syncing.current = false;
    }
  }, [organizationId, router, t]);

  // Send anything left in the queue on load and whenever the network returns.
  useEffect(() => {
    const first = window.setTimeout(() => void flush(), 0);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  const stamp = (action: "in" | "out") => {
    writeQueue(
      enqueue(readQueue(), {
        clientId: crypto.randomUUID(),
        action,
        at: new Date().toISOString(),
        organizationId,
        ...(action === "in" && Object.keys(choice).length ? { posting: choice } : {}),
      }),
    );
    setMessage(null);
    void flush();
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-sm",
        state.in ? "border-primary/40 bg-primary/5" : "bg-card",
      )}
      data-testid="stamp-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t.title}</p>
          <p className="text-xl font-semibold" data-testid="stamp-status">
            {state.in && state.since
              ? t.stampedInSince(localParts(state.since).time)
              : t.notStampedIn}
          </p>
          {state.pending > 0 ? (
            <p
              className="mt-1 flex items-center gap-1.5 text-xs text-warning-foreground"
              data-testid="stamp-queue"
            >
              <CloudOff className="size-3.5" /> {t.queued(state.pending)}
            </p>
          ) : null}
        </div>
        {!state.in && posting.length ? (
          <div className="flex flex-wrap gap-2" data-testid="stamp-posting">
            {posting.map((d) => (
              <NativeSelect
                key={d.id}
                aria-label={`${da.posting.stampChoice}: ${d.name}`}
                className="w-48"
                value={choice[d.id] ?? ""}
                onChange={(e) => {
                  const next = { ...choice };
                  if (e.target.value) next[d.id] = e.target.value;
                  else delete next[d.id];
                  setChoice(next);
                }}
              >
                <option value="">
                  {d.name}: {da.posting.asPlanned}
                </option>
                {d.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </NativeSelect>
            ))}
          </div>
        ) : null}
        {state.in ? (
          <Button size="lg" variant="outline" disabled={disabled} onClick={() => stamp("out")}>
            <LogOut /> {t.stampOut}
          </Button>
        ) : (
          <Button size="lg" disabled={disabled} onClick={() => stamp("in")}>
            <LogIn /> {t.stampIn}
          </Button>
        )}
      </div>
      {message ? (
        <p
          role="status"
          className={cn(
            "mt-3 text-sm",
            message.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
