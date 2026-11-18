import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { signWebhook } from "./crypto";

/**
 * Sends due webhook deliveries (claimed in the database, so parallel senders
 * never send the same delivery twice) and records the result. Failures are
 * retried by the database schedule. Called after actions that emit events and
 * by the cron route.
 */
export async function dispatchWebhooks(limit = 20): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("webhook_claim", { p_limit: limit });
  if (error || !data?.length) return 0;
  await Promise.all(
    data.map(async (d) => {
      const body = JSON.stringify(d.payload);
      try {
        const res = await fetch(d.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Turnus-Webhooks/1",
            "turnus-event": d.event,
            "turnus-delivery": d.id,
            "turnus-signature": signWebhook(d.secret, body, Math.floor(Date.now() / 1000)),
          },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        await db.rpc("webhook_result", {
          p_id: d.id,
          p_ok: res.ok,
          p_status: res.status,
          p_error: res.ok ? "" : `HTTP ${res.status}`,
        });
      } catch (e) {
        await db.rpc("webhook_result", {
          p_id: d.id,
          p_ok: false,
          p_status: 0,
          p_error: e instanceof Error ? e.message : "request failed",
        });
      }
    }),
  );
  return data.length;
}
