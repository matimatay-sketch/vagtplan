import { NextResponse } from "next/server";
import { dispatchWebhooks } from "@/lib/api/webhooks";

/** Sends due webhook deliveries (retries). Called by Vercel Cron with CRON_SECRET. */
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
  return NextResponse.json({ sent });
}
