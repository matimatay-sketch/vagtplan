import type { NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/civil-date";
import { parseReportQuery, toCsv } from "@/lib/domain/reports";
import { loadReport } from "@/lib/reports/load";

/** The chosen report as CSV (same rows as on the page, all of them). */
export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!hasAny(ctx.permissions, ["reports.view"])) return new Response(null, { status: 403 });
  const q = parseReportQuery(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
    todayIn(ctx.organization.timezone),
  );
  const table = await loadReport(await createClient(), ctx, q);
  return new Response(toCsv(table), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport_${q.report}_${q.from}_${q.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
