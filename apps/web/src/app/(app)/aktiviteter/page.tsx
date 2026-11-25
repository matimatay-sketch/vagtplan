import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, CalendarPlus, CalendarX, Car, MessageSquareWarning } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { DecisionButtons } from "@/components/activities/decision-buttons";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { daypartOf } from "@/lib/domain/daypart";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Aktiviteter" };

const t = da.activities;
const dayFormat = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const day = (iso: string) => dayFormat.format(new Date(`${localParts(iso).date}T00:00:00Z`));
const name = (e: { first_name: string; last_name: string } | null) =>
  e ? `${e.first_name} ${e.last_name}` : "";

/** A shift as a row: day and time with the daypart stripe. */
function ShiftLine({ start, end, place }: { start: string; end: string; place: string }) {
  return (
    <div
      data-daypart={daypartOf(start)}
      className="flex flex-wrap items-baseline gap-x-3 border-l-4 border-l-(color:--dp) pl-3"
    >
      <span className="text-sm font-medium first-letter:uppercase">{day(start)}</span>
      <span className="font-semibold tabular">{timeRange(start, end)}</span>
      <span className="text-xs text-muted-foreground">{place}</span>
    </div>
  );
}

export default async function ActivitiesPage() {
  const ctx = await requireContext([
    "schedule.manage",
    "time.approve",
    "absence.approve",
    "absence.manage",
    "expenses.manage",
  ]);
  const supabase = await createClient();
  const [{ data: openRequests }, { data: waiting }, { data: absences }, { count: expenseCount }] =
    await Promise.all([
      // RLS: the department's planners see the requests.
      supabase
        .from("open_shift_request")
        .select(
          "id, created_at, shift:shift_id (start_at, end_at, label), employee:employee!open_shift_request_organization_id_employee_id_fkey (first_name, last_name), department:department!open_shift_request_organization_id_department_id_fkey (name)",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("status", "requested")
        .order("created_at"),
      supabase.rpc("waiting_items", { p_org: ctx.organization.id }),
      supabase
        .from("absence")
        .select(
          "id, type_code, from_date, to_date, employee:employee!absence_organization_id_employee_id_fkey (first_name, last_name)",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("status", "requested")
        .order("from_date")
        .limit(50),
      supabase
        .from("expense")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organization.id)
        .eq("status", "pending"),
    ]);
  const swapIds = (waiting ?? []).filter((w) => w.kind === "swap").map((w) => w.id);
  const cancellations = (waiting ?? []).filter((w) => w.kind === "cancellation");
  const { data: swaps } = swapIds.length
    ? await supabase.rpc("swap_details", { p_ids: swapIds })
    : { data: [] };
  const swapsToDecide = (swaps ?? []).filter((s) => s.can_decide && s.status === "accepted");

  const tiles = [
    { key: "openShifts", icon: CalendarPlus, n: (openRequests ?? []).length, href: "#ledige" },
    { key: "swaps", icon: ArrowLeftRight, n: swapsToDecide.length, href: "#bytte" },
    { key: "cancellations", icon: MessageSquareWarning, n: cancellations.length, href: "#afbud" },
    { key: "absence", icon: CalendarX, n: (absences ?? []).length, href: "#fravaer" },
    { key: "expenses", icon: Car, n: expenseCount ?? 0, href: "/tid/godkend#udlaeg" },
  ] as const;
  const total = tiles.reduce((sum, x) => sum + x.n, 0);

  return (
    <>
      <PageHeader title={t.title} help={t.help} />
      <ul
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        data-testid="activity-tiles"
      >
        {tiles.map((x) => (
          <li key={x.key}>
            <Link
              href={x.href}
              className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:bg-muted"
              data-testid={`tile-${x.key}`}
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <x.icon className="size-4" aria-hidden /> {t.tiles[x.key]}
              </span>
              <span
                className={
                  x.n ? "text-lg font-semibold text-primary" : "text-lg text-muted-foreground"
                }
              >
                {x.n ? t.waiting(x.n) : t.nothing}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {total === 0 ? <EmptyState>{t.empty}</EmptyState> : null}

      {(openRequests ?? []).length ? (
        <section id="ledige" className="mb-8 grid gap-3" aria-labelledby="ledige-h">
          <h2 id="ledige-h" className="flex items-center gap-2 text-base font-semibold">
            <CalendarPlus className="size-4 text-primary" aria-hidden /> {t.tiles.openShifts}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="open-shift-requests">
            {(openRequests ?? []).map((r) => (
              <li key={r.id} className="grid gap-3 rounded-xl border bg-card p-4">
                {r.shift ? (
                  <ShiftLine
                    start={r.shift.start_at}
                    end={r.shift.end_at}
                    place={[r.department?.name, r.shift.label].filter(Boolean).join(" · ")}
                  />
                ) : null}
                <p className="text-sm">{t.asksFor(name(r.employee))}</p>
                <DecisionButtons kind="open_shift" id={r.id} label={t.asksFor(name(r.employee))} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {swapsToDecide.length ? (
        <section id="bytte" className="mb-8 grid gap-3" aria-labelledby="bytte-h">
          <h2 id="bytte-h" className="flex items-center gap-2 text-base font-semibold">
            <ArrowLeftRight className="size-4 text-primary" aria-hidden /> {t.tiles.swaps}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="swap-requests">
            {swapsToDecide.map((s) => (
              <li key={s.id} className="grid gap-3 rounded-xl border bg-card p-4">
                <ShiftLine start={s.shift_start} end={s.shift_end} place={s.department_name} />
                <p className="text-sm">{t.swapFromTo(s.requester_name, s.target_name)}</p>
                <Link
                  href={`/beskeder/${s.conversation_id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {t.openConversation}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {cancellations.length ? (
        <section id="afbud" className="mb-8 grid gap-3" aria-labelledby="afbud-h">
          <h2 id="afbud-h" className="flex items-center gap-2 text-base font-semibold">
            <MessageSquareWarning className="size-4 text-primary" aria-hidden />{" "}
            {t.tiles.cancellations}
          </h2>
          <ul className="grid gap-2">
            {cancellations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/beskeder/${c.conversation_id}`}
                  className="flex items-center justify-between rounded-xl border bg-card p-3 text-sm hover:bg-muted"
                >
                  {t.cancellationBy} · {formatDate(localParts(c.created_at).date)}
                  <span className="text-primary">{t.openConversation}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(absences ?? []).length ? (
        <section id="fravaer" className="mb-8 grid gap-3" aria-labelledby="fravaer-h">
          <h2 id="fravaer-h" className="flex items-center gap-2 text-base font-semibold">
            <CalendarX className="size-4 text-primary" aria-hidden /> {t.tiles.absence}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="absence-requests">
            {(absences ?? []).map((a) => {
              const when =
                a.from_date === a.to_date
                  ? formatDate(a.from_date)
                  : `${formatDate(a.from_date)} – ${formatDate(a.to_date)}`;
              return (
                <li key={a.id} className="grid gap-3 rounded-xl border bg-card p-4">
                  <p className="text-sm">
                    <span className="font-medium">{name(a.employee)}</span>{" "}
                    <span className="text-muted-foreground">· {when}</span>
                  </p>
                  <DecisionButtons kind="absence" id={a.id} label={`${name(a.employee)} ${when}`} />
                </li>
              );
            })}
          </ul>
          <Link
            href="/fravaer/godkend"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t.seeAbsence}
          </Link>
        </section>
      ) : null}
    </>
  );
}
