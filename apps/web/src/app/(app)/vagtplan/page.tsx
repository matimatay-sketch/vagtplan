import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutTemplate, Repeat } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";
import { WeekBoard } from "@/components/schedule/week-board";
import { DayBoard } from "@/components/schedule/day-board";
import { PublishButton } from "@/components/schedule/publish-dialog";
import { CopyWeekButton } from "@/components/schedule/copy-week-button";
import { RealtimeRefresh } from "@/components/schedule/realtime-refresh";
import { ProposeButton } from "@/components/assistant/propose-button";
import { ProposalBanner } from "@/components/assistant/proposal-banner";
import { assistantState } from "@/lib/assistant/access";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment } from "@/lib/permissions";
import { addDays, isValidIsoDate, todayIn } from "@/lib/domain/civil-date";
import { isoWeekNumber, weekDates, weekStartOf } from "@/lib/domain/schedule-time";
import { loadWeek } from "@/lib/schedule/load-week";
import { da } from "@/lib/i18n/da";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vagtplan" };

const weekdayShort = new Intl.DateTimeFormat("da-DK", { weekday: "short", timeZone: "UTC" });
const dayTab = (d: string) =>
  `${weekdayShort.format(new Date(`${d}T00:00:00Z`)).replace(".", "")} ${Number(d.slice(8))}.`;

export default async function SchedulePage({ searchParams }: PageProps<"/vagtplan">) {
  const ctx = await requireContext(["schedule.view", "schedule.manage"]);
  const sp = await searchParams;
  const t = da.schedule;
  const today = todayIn(ctx.organization.timezone);
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("department")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  const visible = (departments ?? []).filter(
    (d) =>
      canInDepartment(ctx.permissions, "schedule.view", d.id, ctx.responsibleDepartmentIds) ||
      canInDepartment(ctx.permissions, "schedule.manage", d.id, ctx.responsibleDepartmentIds),
  );
  if (visible.length === 0) {
    return (
      <>
        <PageHeader title={t.title} />
        <EmptyState>{t.noDepartments}</EmptyState>
      </>
    );
  }
  const department = visible.find((d) => d.id === str(sp.afdeling)) ?? visible[0]!;
  const weekStart = weekStartOf(isValidIsoDate(str(sp.uge)) ? str(sp.uge) : today);
  const dates = weekDates(weekStart);
  const view = str(sp.visning) === "dag" ? "dag" : "uge";
  const day =
    isValidIsoDate(str(sp.dag)) && dates.includes(str(sp.dag))
      ? str(sp.dag)
      : dates.includes(today)
        ? today
        : weekStart;

  const [board, assistant, { data: proposals }] = await Promise.all([
    loadWeek(supabase, ctx, department.id, weekStart),
    assistantState(supabase, ctx),
    supabase
      .from("assistant_proposal")
      .select("id, note, shift!shift_proposal_fk (id, archived_at, published)")
      .eq("department_id", department.id)
      .eq("week_start", weekStart)
      .is("discarded_at", null)
      .order("created_at"),
  ]);
  const activeProposals = (proposals ?? [])
    .map((p) => ({
      id: p.id,
      note: p.note,
      shiftCount: p.shift.filter((s) => s.archived_at === null).length,
    }))
    .filter((p) => p.shiftCount > 0);
  const canPropose =
    board.canManage &&
    assistant.usable &&
    canInDepartment(ctx.permissions, "assistant.use", department.id, ctx.responsibleDepartmentIds);
  const href = (p: Record<string, string>) =>
    `/vagtplan?${new URLSearchParams({ afdeling: department.id, uge: weekStart, visning: view, ...(view === "dag" ? { dag: day } : {}), ...p })}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            {department.name} <RealtimeRefresh departmentId={department.id} />
          </span>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-3">
            {t.week(isoWeekNumber(weekStart))}
            <span className="text-base font-normal text-muted-foreground">
              {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
            </span>
          </span>
        }
        actions={
          <>
            {canPropose ? (
              <ProposeButton departmentId={department.id} weekStart={weekStart} />
            ) : null}
            {board.canManage ? (
              <CopyWeekButton departmentId={department.id} weekStart={weekStart} />
            ) : null}
            {board.canPublish ? (
              <PublishButton
                departmentId={department.id}
                weekStart={weekStart}
                pendingCount={board.pendingCount}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/vagtplan">
          <input type="hidden" name="uge" value={weekStart} />
          <input type="hidden" name="visning" value={view} />
          <div className="w-48">
            <NativeSelect name="afdeling" defaultValue={department.id} aria-label={t.department}>
              {visible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            {da.common.show}
          </Button>
        </form>
        <div className="flex items-center rounded-lg border bg-card p-0.5">
          <Button asChild variant="ghost" size="icon" className="size-8" aria-label={t.previous}>
            <Link
              href={href({
                uge: addDays(weekStart, -7),
                ...(view === "dag" ? { dag: addDays(day, -7) } : {}),
              })}
            >
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={href({ uge: weekStartOf(today), dag: today })}>{t.today}</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="size-8" aria-label={t.next}>
            <Link
              href={href({
                uge: addDays(weekStart, 7),
                ...(view === "dag" ? { dag: addDays(day, 7) } : {}),
              })}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <div
          className="flex items-center rounded-lg border bg-card p-0.5"
          role="tablist"
          aria-label="Visning"
        >
          {(["uge", "dag"] as const).map((v) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={href({ visning: v, ...(v === "dag" ? { dag: day } : {}) })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v === "uge" ? t.weekView : t.dayView}
            </Link>
          ))}
        </div>
        {board.canManage ? (
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/vagtplan/turnus">
              <Repeat /> {da.nav.turnus}
            </Link>
          </Button>
        ) : null}
        {board.canManage ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/vagtplan/skabeloner">
              <LayoutTemplate /> {t.templates}
            </Link>
          </Button>
        ) : null}
      </div>

      <ProposalBanner proposals={activeProposals} canManage={board.canManage} />
      {board.shifts.some((x) => x.uncovered) ? (
        <Alert className="mb-4" data-testid="uncovered-alert">
          <AlertDescription>
            {da.absence.uncoveredShifts(board.shifts.filter((x) => x.uncovered).length)}
          </AlertDescription>
        </Alert>
      ) : null}
      {view === "dag" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label={t.dayView}>
            {dates.map((d) => (
              <Link
                key={d}
                role="tab"
                aria-selected={d === day}
                href={href({ dag: d })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm capitalize",
                  d === day
                    ? "border-primary bg-secondary font-medium"
                    : "bg-card text-muted-foreground hover:bg-muted",
                  d === today && "text-signal",
                )}
              >
                {dayTab(d)}
              </Link>
            ))}
          </div>
          <DayBoard board={board} date={day} />
        </>
      ) : (
        <>
          <WeekBoard board={board} dates={dates} today={today} />
          {board.canManage ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" /> {t.dragHint}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
