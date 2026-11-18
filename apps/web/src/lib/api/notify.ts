import "server-only";
import { after } from "next/server";
import { dispatchWebhooks } from "./webhooks";

/** Sends pending webhooks after the response (events are recorded by the database). */
export function sendWebhooksSoon() {
  after(async () => {
    try {
      await dispatchWebhooks();
    } catch (e) {
      console.error("webhooks", e);
    }
  });
}
