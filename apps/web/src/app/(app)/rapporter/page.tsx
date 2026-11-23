import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, SubmitButton } from "@/components/form";
import { HelpTip } from "@/components/help/help";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/civil-date";
import { REPORTS, parseReportQuery } from "@/lib/domain/reports";
import { loadReport } from "@/lib/reports/load";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rapporter" };

/** Rows shown on the page; the CSV has them all. */
const SHOWN = 500;

export default async function ReportsPage({ searchParams }: PageProps<"/rapporter">) {
  const ctx = await requireContext(["reports.view"]);
  const t = da.reports;
  const supabase = await createClient();
  const q = parseReportQuery(await searchParams, todayIn(ctx.organization.timezone));
  const [{ data: departments }, table] = await Promise.all([
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    loadReport(supabase, ctx, q),
  ]);
  const params = new URLSearchParams({ rapport: q.report, fra: q.from, til: q.to });
  if (q.departmentId) params.set("afdeling", q.departmentId);

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <form className="mb-6 flex flex-wrap items-end gap-3" data-testid="report-form">
        <Field label={t.report} htmlFor="report-rapport">
          <NativeSelect
            id="report-rapport"
            name="rapport"
            defaultValue={q.report}
            className="min-w-64"
          >
            {REPORTS.map((r) => (
              <option key={r} value={r}>
                {t.kinds[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.from} htmlFor="report-fra">
          <Input type="date" id="report-fra" name="fra" defaultValue={q.from} className="w-40" />
        </Field>
        <Field label={t.to} htmlFor="report-til">
          <Input type="date" id="report-til" name="til" defaultValue={q.to} className="w-40" />
        </Field>
        <Field label={t.department} htmlFor="report-afdeling">
          <NativeSelect id="report-afdeling" name="afdeling" defaultValue={q.departmentId ?? ""}>
            <option value="">{t.allDepartments}</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <SubmitButton>{t.show}</SubmitButton>
        <Button asChild variant="outline">
          <a href={`/rapporter/csv?${params}`} download data-testid="report-download">
            <Download /> {t.download}
          </a>
        </Button>
      </form>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1 text-lg font-semibold">
          {t.kinds[q.report]}
          {q.report === "norm" ? <HelpTip>{t.normHelp}</HelpTip> : null}
        </h2>
        <span className="text-sm text-muted-foreground" data-testid="report-count">
          {t.count(table.rows.length)}
        </span>
      </div>
      {table.rows.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <>
          {table.rows.length > SHOWN ? (
            <p className="mb-2 text-sm text-muted-foreground">
              {t.truncated(SHOWN, table.rows.length)}
            </p>
          ) : null}
          <Card className="py-0">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={t.kinds[q.report]}
            >
              <table className="w-full text-sm" data-testid="report-table">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    {table.columns.map((c) => (
                      <th
                        key={c.key}
                        className={cn(
                          "px-3 py-2 font-medium whitespace-nowrap",
                          c.numeric && "text-right",
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, SHOWN).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {table.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-3 py-1.5 whitespace-nowrap",
                            c.numeric && "text-right tabular",
                          )}
                        >
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
