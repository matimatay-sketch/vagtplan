import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { payPeriodsFrom, type PayPeriodGroupSpec } from "@/lib/domain/pay-periods";
import { addDays, isoWeekday, todayIn } from "@/lib/domain/civil-date";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { LazyDetails } from "@/components/lazy-details";
import { DeletePayPeriodGroup, PayPeriodGroupForm } from "./form";

export const metadata: Metadata = { title: "Lønperioder" };

export default async function PayPeriodGroupsPage() {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.payPeriodGroups;
  const { data: groups } = await supabase
    .from("pay_period_group")
    .select("id, name, frequency, anchor_date, month_start_day")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <Card className="mb-6">
        <CardContent>
          <PayPeriodGroupForm defaultMonday={addDays(today, 1 - isoWeekday(today))} />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(groups ?? []).map((g) => {
          const periods = payPeriodsFrom(g as PayPeriodGroupSpec, today, 3);
          return (
            <Card key={g.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{g.name}</CardTitle>
                <Badge variant="secondary">{t.frequencies[g.frequency]}</Badge>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t.example}
                </p>
                <ol className="grid gap-1 text-sm tabular">
                  {periods.map((p, i) => (
                    <li key={p.start} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                      {formatDate(p.start)} – {formatDate(p.end)}
                      {i === 0 ? (
                        <span className="ml-2 text-xs text-accent-foreground">● nu</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <LazyDetails
                  className="mt-4 border-t pt-3 text-sm"
                  summaryClassName="text-foreground"
                  summary={t.editGroup}
                >
                  <div className="mt-3 grid gap-3">
                    <PayPeriodGroupForm
                      defaultMonday={addDays(today, 1 - isoWeekday(today))}
                      group={g}
                    />
                    <p className="text-xs text-muted-foreground">{t.editHelp}</p>
                    <DeletePayPeriodGroup id={g.id} name={g.name} />
                  </div>
                </LazyDetails>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
