import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { calendarFeed, type CalendarShift } from "@/lib/domain/calendar-feed";
import { da } from "@/lib/i18n/da";

const DAY = 86_400_000;

/**
 * The feed for a calendar token, or null when the link is unknown or stopped.
 * The token is checked in the database before the service client reads
 * anything, and every query is limited to that organization and employee.
 */
export async function loadCalendarFeed(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const db = createServiceClient();
  const { data: feed } = await db.rpc("calendar_feed_lookup", { p_token: token });
  const f = feed?.[0];
  if (!f) return null;
  const now = new Date();
  const [{ data: employee }, { data: shifts }] = await Promise.all([
    db
      .from("employee")
      .select("first_name")
      .eq("organization_id", f.organization_id)
      .eq("id", f.employee_id)
      .single(),
    db
      .from("shift")
      .select(
        "id, published, department:department!shift_organization_id_department_id_fkey (name)",
      )
      .eq("organization_id", f.organization_id)
      .eq("published->>employee_id", f.employee_id)
      .not("published", "is", null)
      // Shifts move within a few days at most; the snapshot holds the times.
      .gte("start_at", new Date(now.getTime() - 40 * DAY).toISOString())
      .lt("start_at", new Date(now.getTime() + 400 * DAY).toISOString())
      .order("start_at")
      .limit(2000),
  ]);
  const rows: CalendarShift[] = (shifts ?? []).flatMap((s) => {
    const p = s.published as Record<string, string | null> | null;
    if (!p?.start_at || !p.end_at || p.employee_id !== f.employee_id) return [];
    return [
      {
        id: s.id,
        start_at: p.start_at,
        end_at: p.end_at,
        label: p.label ?? null,
        kind: p.kind ?? "work",
        department: s.department?.name ?? null,
      },
    ];
  });
  return calendarFeed(rows, { name: da.calendar.feedName(employee?.first_name ?? ""), now });
}
