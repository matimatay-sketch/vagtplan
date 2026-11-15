import type { NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadProjectReport, reportFilter } from "@/lib/projects/load-report";
import { decimalHours } from "@/lib/domain/project-report";
import { localParts } from "@/lib/domain/schedule-time";
import { toCsv } from "@/lib/domain/csv";
import { da } from "@/lib/i18n/da";

/** Project hours as a Danish CSV file (semicolon, CRLF, BOM). Read through RLS. */
export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!ctx.permissions["projects.view"]) return new Response(null, { status: 403 });
  const filter = reportFilter(
    Object.fromEntries(request.nextUrl.searchParams),
    ctx.organization.timezone,
  );
  const supabase = await createClient();
  const { projects, lines } = await loadProjectReport(supabase, ctx, filter);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const c = da.projects.csv;
  const csv = toCsv(
    [
      c.projectNumber,
      c.project,
      c.customer,
      c.date,
      c.start,
      c.end,
      c.employeeNumber,
      c.employee,
      c.department,
      c.status,
      c.minutes,
      c.hours,
    ],
    lines.map((l) => {
      const p = byId.get(l.projectId);
      return [
        p?.number ?? "",
        p?.name ?? "",
        p?.customer ?? "",
        l.date,
        localParts(l.start).time,
        localParts(l.end).time,
        l.employeeNumber ?? "",
        l.employeeName ?? da.projects.openShift,
        l.departmentName,
        da.projects.statuses[l.status],
        l.minutes,
        decimalHours(l.minutes),
      ];
    }),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="projekttimer_${filter.source === "actual" ? "registreret_" : ""}${filter.from}_${filter.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
