import { loadCalendarFeed } from "@/lib/calendar/feed";

/**
 * The employee's published shifts as an iCalendar feed. The secret token in the
 * link is the only credential (made on Profil, replaced or stopped there).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ics = await loadCalendarFeed(token.replace(/\.ics$/, ""));
  if (ics === null) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="turnus.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
