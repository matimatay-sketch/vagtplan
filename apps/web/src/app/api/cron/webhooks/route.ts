import { NextResponse } from "next/server";
import { dispatchWebhooks } from "@/lib/api/webhooks";
import { dispatchEmails } from "@/lib/messages/email";
import { dispatchPush } from "@/lib/push/send";
import { createServiceClient } from "@/lib/supabase/server";

/** Sends due webhook deliveries, automatic reminders and notification e-mails and push notifications (retries). Called by Vercel Cron with CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  let sent = 0;
  for (let i = 0; i < 5; i++) {
    const n = await dispatchWebhooks(50);
    sent += n;
    if (n < 50) break;
  }
  // Automatic reminders due today; their e-mails go out just below.
  const { data: reminders } = await createServiceClient().rpc("run_due_reminders");
  let emails = 0;
  for (let i = 0; i < 5; i++) {
    const n = await dispatchEmails(50);
    emails += n;
    if (n < 50) break;
  }
  let push = 0;
  for (let i = 0; i < 5; i++) {
    const n = await dispatchPush(50);
    push += n;
    if (n < 50) break;
  }
  return NextResponse.json({ sent, emails, push, reminders: reminders ?? 0 });
}
