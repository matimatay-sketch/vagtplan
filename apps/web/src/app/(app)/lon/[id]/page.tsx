import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PeriodActions } from "@/components/payroll/period-actions";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasOrg } from "@/lib/permissions";
import { employeesInPeriod } from "@/lib/payroll/periods";
import { decimalHours } from "@/lib/domain/project-report";
import { formatDate } from "@/lib/format";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";
import { formatKroner } from "@/lib/domain/numbers";

export const metadata: Metadata = { title: "Lønperiode" };

const kr = formatKroner;

type Explanation = {
  ruleId: string;
  primitive: string;
  source: string;
  layer: { agreementId: string; version: number };
  todoJura: string | null;
  note: string | null;
  intervals: { date: string; start: string; end: string; minutes: number }[];
};

export default async function PayPeriodPage({ params }: PageProps<"/lon/[id]">) {
  const ctx = await requireContext(["payroll.view", "payroll.manage"]);
  const { id } = await params;
  const supabase = await createClient();
  const t = da.payroll;
  const { data: p } = await supabase
    .from("pay_period")
    .select("id, group_id, start_date, end_date, status, closed_at, pay_period_group (name)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [employees, { data: runs }, { data: templates }] = await Promise.all([
    employeesInPeriod(supabase, { groupId: p.group_id, start: p.start_date, end: p.end_date }),
    supabase
      .from("pay_run")
      .select(
        "id, employee_id, calculated_at, pending_entries, notes, pay_line (id, position, pay_code, label, unit, quantity_minutes, rate_ore, amount_ore, explanation)",
      )
      .eq("pay_period_id", id)
      .is("superseded_at", null),
    supabase.from("export_template").select("id, name").is("archived_at", null).order("name"),
  ]);
  const runBy = new Map((runs ?? []).map((r) => [r.employee_id, r]));
  // Only employees the user may see pay for (the runs are filtered by the database).
  const visible = hasOrg(ctx.permissions, "payroll.manage")
    ? employees
    : employees.filter((e) => runBy.has(e.id));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/lon" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={`${p.pay_period_group?.name ?? ""} · ${formatDate(p.start_date)} – ${formatDate(p.end_date)}`}
        lead={
          <Badge
            variant={p.status === "closed" ? "secondary" : "outline"}
            data-testid="period-status"
          >
            {t.statuses[p.status]}
          </Badge>
        }
        actions={
          <PeriodActions
            periodId={p.id}
            open={p.status === "open"}
            canManage={hasOrg(ctx.permissions, "payroll.manage")}
            templates={templates ?? []}
          />
        }
      />
      {visible.length === 0 ? (
        <EmptyState>{t.noEmployees}</EmptyState>
      ) : (
        <div className="grid gap-4" data-testid="pay-employees">
          {visible.map((e) => {
            const run = runBy.get(e.id);
            const lines = [...(run?.pay_line ?? [])].sort((a, b) => a.position - b.position);
            const total = lines.reduce((s, l) => s + Number(l.amount_ore), 0);
            return (
              <section
                key={e.id}
                className="overflow-hidden rounded-xl border bg-card"
                data-employee={e.name}
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                  <span className="font-semibold">
                    {e.name} <span className="font-normal text-muted-foreground">#{e.number}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {run
                      ? t.calculatedAt(
                          `${formatDate(localParts(run.calculated_at).date)} ${localParts(run.calculated_at).time}`,
                        )
                      : t.notCalculated}
                  </span>
                </header>
                {run?.pending_entries ? (
                  <Alert className="m-3 w-auto">
                    <AlertDescription>{t.pendingWarning(run.pending_entries)}</AlertDescription>
                  </Alert>
                ) : null}
                {run ? (
                  <table className="w-full text-sm" data-testid="pay-lines">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                        <th className="px-4 py-2 font-medium">{t.payCode}</th>
                        <th className="px-4 py-2 font-medium">{t.text}</th>
                        <th className="px-4 py-2 text-right font-medium">{t.quantity}</th>
                        <th className="px-4 py-2 text-right font-medium">{t.rate}</th>
                        <th className="px-4 py-2 text-right font-medium">{t.amount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const x = l.explanation as unknown as Explanation;
                        return (
                          <tr
                            key={l.id}
                            className="border-b align-top last:border-0"
                            data-pay-code={l.pay_code}
                          >
                            <td className="px-4 py-2 font-mono text-xs">{l.pay_code}</td>
                            <td className="px-4 py-2">
                              {l.label}
                              <details className="mt-1 text-xs text-muted-foreground">
                                <summary className="cursor-pointer">{t.why}</summary>
                                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                  <dt>{t.rule}</dt>
                                  <dd>
                                    {x.ruleId} ({x.primitive})
                                  </dd>
                                  <dt>{t.source}</dt>
                                  <dd>{x.source}</dd>
                                  <dt>{t.layer}</dt>
                                  <dd>
                                    {x.layer.agreementId} v{x.layer.version}
                                  </dd>
                                  {x.note ? (
                                    <>
                                      <dt>{t.notes}</dt>
                                      <dd>{x.note}</dd>
                                    </>
                                  ) : null}
                                  <dt>{t.intervals}</dt>
                                  <dd>
                                    {x.intervals
                                      .map(
                                        (i) =>
                                          `${formatDate(i.date)} ${timeRange(i.start, i.end)} (${i.minutes} min)`,
                                      )
                                      .join(", ")}
                                  </dd>
                                </dl>
                              </details>
                            </td>
                            <td className="px-4 py-2 text-right tabular">
                              {l.unit === "fixed" ? "–" : `${decimalHours(l.quantity_minutes)} t`}
                            </td>
                            <td className="px-4 py-2 text-right tabular">{kr(l.rate_ore)}</td>
                            <td className="px-4 py-2 text-right font-medium tabular">
                              {kr(Number(l.amount_ore))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td className="px-4 py-2" colSpan={4}>
                          {t.total}
                        </td>
                        <td className="px-4 py-2 text-right tabular" data-testid="pay-total">
                          {kr(total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
