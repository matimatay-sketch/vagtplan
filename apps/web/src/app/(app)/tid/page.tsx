import type { Metadata } from "next";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { StampCard } from "@/components/time/stamp-card";
import { MyEntries } from "@/components/time/my-entries";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { loadTimeOverview } from "@/lib/time/load";
import { loadSupplementOptions } from "@/lib/time/supplements";
import { loadPostingDimensions } from "@/lib/posting/load";
import { stampPostingFor } from "@/lib/time/stamp-context";
import { stampNeedsLocation } from "@/lib/time/location";
import { reasonsForEmployee } from "@/lib/time/deviation-types";
import { inScope, type Who } from "@/lib/domain/scope";
import { loadDeviationContext, loadStampPlans } from "@/lib/time/deviation-context";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Tid" };

const NOBODY: Who = { departmentIds: null, agreementIds: null, groupId: undefined };

const DAYS = 14;

export default async function TimePage() {
  const ctx = await requireContext();
  const t = da.time;
  if (!ctx.employee) {
    return (
      <>
        <PageHeader title={t.title} help={t.lead} />
        <EmptyState>{da.common.notAllowed}</EmptyState>
      </>
    );
  }
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const from = addDays(today, -(DAYS - 1));
  const [overview, posting, supplementOptions] = await Promise.all([
    loadTimeOverview(supabase, ctx, { from, to: today, onlyMine: true }),
    loadPostingDimensions(supabase),
    loadSupplementOptions(supabase, ctx.organization.id),
  ]);
  const open = overview.rows.find((r) => r.kind === "entry" && r.status === "open");
  const stampPosting = await stampPostingFor(supabase, ctx.employee.id, posting);
  const [deviation, stampPlans, needsLocation] = await Promise.all([
    loadDeviationContext(supabase, ctx.organization.id, [ctx.employee.id]),
    loadStampPlans(supabase, ctx.employee.id),
    stampNeedsLocation(supabase, ctx.organization.id, ctx.employee.id),
  ]);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, -i));

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <div className="grid gap-6">
        {overview.exempt.has(ctx.employee.id) ? <Alert>{t.exempt}</Alert> : null}
        <StampCard
          organizationId={ctx.organization.id}
          employeeId={ctx.employee.id}
          openSince={open?.start ?? null}
          posting={stampPosting}
          reasons={reasonsForEmployee(deviation, ctx.employee.id)}
          thresholdMinutes={deviation.thresholdMinutes}
          stampPlans={stampPlans}
          openPlan={open?.plan ? { start: open.plan.start, end: open.plan.end } : null}
          requireLocation={needsLocation}
        />
        <MyEntries
          rows={overview.rows}
          daily={overview.daily[ctx.employee.id] ?? {}}
          posting={posting}
          supplements={{
            // The employee may only add supplements that apply to them ("Gælder for").
            options: supplementOptions.map((o) =>
              o.employeeSelectable && !inScope(o, deviation.who[ctx.employee!.id] ?? NOBODY)
                ? { ...o, employeeSelectable: false }
                : o,
            ),
            chooseAll: false,
          }}
          deviation={deviation}
          employeeId={ctx.employee.id}
          dates={dates}
        />
      </div>
    </>
  );
}
