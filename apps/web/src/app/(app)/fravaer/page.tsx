import type { Metadata } from "next";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AbsenceRequestForm } from "@/components/absence/request-form";
import { AbsenceList } from "@/components/absence/absence-list";
import { BalanceTable } from "@/components/absence/balance-table";
import { BalanceCards } from "@/components/absence/balance-cards";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { loadLeave } from "@/lib/absence/load";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Fravær og ferie" };

export default async function MyAbsencePage() {
  const ctx = await requireContext();
  const t = da.absence;
  if (!ctx.employee)
    return (
      <>
        <PageHeader title={t.title} />
        <EmptyState>{da.common.notAllowed}</EmptyState>
      </>
    );
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const me = ctx.employee.id;
  const { leave, absences } = await loadLeave(supabase, ctx, [me], {
    absencesFrom: addDays(today, -120),
  });
  const mine = leave.get(me)!;
  const labels = Object.fromEntries(mine.types.map((x) => [x.code, x.label]));

  return (
    <>
      <PageHeader
        title={t.title}
        lead={t.leadSimple}
        actions={
          <Button asChild>
            <a href="#soeg">
              <Plus />
              {t.requestCta}
            </a>
          </Button>
        }
      />
      <div className="grid gap-6">
        {mine.mainHoliday && !mine.mainHoliday.ok ? (
          <Alert data-testid="main-holiday-warning">
            <AlertDescription>
              {t.mainHolidayWarning(
                formatDate(mine.mainHoliday.from),
                formatDate(mine.mainHoliday.to),
                mine.mainHoliday.required,
                mine.mainHoliday.longest,
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t.myBalances}</h2>
          <BalanceCards balances={mine.balances} labels={labels} today={today} />
          <details className="group text-sm">
            <summary className="flex min-h-11 w-fit cursor-pointer items-center text-muted-foreground underline-offset-4 hover:underline">
              {t.balanceDetails}
            </summary>
            <div className="mt-2">
              <BalanceTable balances={mine.balances} labels={labels} today={today} />
            </div>
          </details>
        </section>
        <Card id="soeg" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">{t.request}</CardTitle>
          </CardHeader>
          <CardContent>
            <AbsenceRequestForm mode="request" types={mine.types} defaultDate={today} />
          </CardContent>
        </Card>
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t.myAbsences}</h2>
          <AbsenceList
            testId="my-absences"
            rows={absences.map((a) => ({ ...a, typeLabel: labels[a.typeCode] ?? a.typeCode }))}
          />
        </section>
      </div>
    </>
  );
}
