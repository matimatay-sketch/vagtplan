import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/lib/auth";
import { hasOrg } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { exportSettingsSchema, renderExport, type ExportRow } from "@/lib/domain/export";

/** The pay period's current pay lines in the chosen export template. */
export async function GET(request: NextRequest, { params }: RouteContext<"/lon/[id]/eksport">) {
  const ctx = await getAppContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!hasOrg(ctx.permissions, "payroll.manage")) return new Response(null, { status: 403 });
  const { id } = await params;
  const templateId = z.guid().safeParse(request.nextUrl.searchParams.get("skabelon"));
  if (!templateId.success || !z.guid().safeParse(id).success)
    return new Response(null, { status: 400 });

  const supabase = await createClient();
  const [{ data: period }, { data: template }, { data: runs }] = await Promise.all([
    supabase.from("pay_period").select("id, start_date, end_date").eq("id", id).maybeSingle(),
    supabase
      .from("export_template")
      .select("id, name, settings")
      .eq("id", templateId.data)
      .maybeSingle(),
    supabase
      .from("pay_run")
      .select(
        "employee:employee!pay_run_organization_id_employee_id_fkey (employee_number, first_name, last_name), pay_line (position, pay_code, label, unit, quantity_minutes, rate_ore, amount_ore, posting)",
      )
      .eq("pay_period_id", id)
      .is("superseded_at", null),
  ]);
  if (!period || !template) return new Response(null, { status: 404 });
  const settings = exportSettingsSchema.parse(template.settings);
  // Posting is stored as ids; the file gets dimension key → value code (including archived values).
  const { data: dims } = await supabase
    .from("posting_dimension")
    .select("id, key, posting_value (id, code)");
  const dimKey = new Map((dims ?? []).map((d) => [d.id, d.key]));
  const valueCode = new Map(
    (dims ?? []).flatMap((d) => d.posting_value.map((v) => [v.id, v.code])),
  );
  const posting = (p: unknown) =>
    Object.fromEntries(
      Object.entries((p ?? {}) as Record<string, string>).flatMap(([d, v]) =>
        dimKey.has(d) ? [[dimKey.get(d)!, valueCode.get(v) ?? ""]] : [],
      ),
    );
  const rows: ExportRow[] = (runs ?? []).flatMap((r) =>
    [...r.pay_line]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        employeeNumber: r.employee?.employee_number ?? "",
        employeeName: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : "",
        payCode: l.pay_code,
        label: l.label,
        unit: l.unit as ExportRow["unit"],
        quantityMinutes: l.quantity_minutes,
        rateOre: l.rate_ore,
        amountOre: Number(l.amount_ore),
        periodStart: period.start_date,
        periodEnd: period.end_date,
        posting: posting(l.posting),
      })),
  );
  const { text, rowCount } = renderExport(settings, rows);
  await supabase.from("export_log").insert({
    organization_id: ctx.organization.id,
    pay_period_id: period.id,
    template_id: template.id,
    row_count: rowCount,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  const safe = template.name.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="loen_${safe}_${period.start_date}_${period.end_date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
