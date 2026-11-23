import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BellRing, CalendarX, Info, MessageSquarePlus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SwapCard } from "@/components/messages/swap-card";
import { CancellationCard } from "@/components/messages/cancellation-card";
import { MessagesRealtime } from "@/components/messages/forms";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadShiftItems } from "@/lib/messages/load";
import { formatDateTime } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Beskeder" };

export default async function MessagesPage({ searchParams }: PageProps<"/beskeder">) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const showHidden = sp.skjulte === "1";
  const supabase = await createClient();
  const t = da.messages;
  const [{ data: conversations }, { data: waiting }] = await Promise.all([
    supabase.rpc("my_conversations", { p_org: ctx.organization.id }),
    supabase.rpc("waiting_items", { p_org: ctx.organization.id }),
  ]);
  const { swaps, cancellations } = await loadShiftItems(
    supabase,
    (waiting ?? []).filter((w) => w.kind === "swap").map((w) => w.id),
    (waiting ?? []).filter((w) => w.kind === "cancellation").map((w) => w.id),
  );
  const all = conversations ?? [];
  const list = all.filter((c) => showHidden || !c.hidden);
  const hiddenCount = all.filter((c) => c.hidden).length;

  return (
    <>
      <MessagesRealtime />
      <PageHeader
        title={t.title}
        help={t.lead}
        actions={
          <Button asChild>
            <Link href="/beskeder/ny">
              <MessageSquarePlus /> {t.newMessage}
            </Link>
          </Button>
        }
      />
      {(waiting ?? []).length ? (
        <Card className="mb-6" data-testid="waiting">
          <CardHeader>
            <CardTitle>{t.waitingCount((waiting ?? []).length)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(waiting ?? []).map((w) => {
              const swap = w.kind === "swap" ? swaps.get(w.id) : undefined;
              const canc = w.kind === "cancellation" ? cancellations.get(w.id) : undefined;
              return (
                <div key={w.id} className="grid gap-1">
                  {swap ? <SwapCard swap={swap} /> : null}
                  {canc ? <CancellationCard item={canc} /> : null}
                  <Link
                    href={`/beskeder/${w.conversation_id}`}
                    className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {t.openConversation} →
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      {list.length === 0 ? (
        <EmptyState action={{ href: "/beskeder/ny", label: t.newMessage }}>{t.empty}</EmptyState>
      ) : (
        <Card className="py-0">
          <ul className="divide-y" data-testid="conversations">
            {list.map((c) => {
              const Icon =
                c.last_kind === "swap"
                  ? ArrowLeftRight
                  : c.last_kind === "cancellation"
                    ? CalendarX
                    : c.last_kind === "system"
                      ? Info
                      : c.last_kind === "reminder"
                        ? BellRing
                        : null;
              return (
                <li key={c.id}>
                  <Link
                    href={`/beskeder/${c.id}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    data-testid="conversation-row"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate", c.unread > 0 && "font-semibold")}>
                          {/* Reminders come from Turnus (the recipient is the only participant). */}
                          {c.participant_names || (c.last_kind === "reminder" ? t.system : t.you)}
                        </span>
                        {c.subject ? (
                          <span className="truncate text-sm text-muted-foreground">
                            · {c.subject}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
                        <span className="truncate">
                          {c.last_kind === "text" ? c.last_body : t.kinds[c.last_kind ?? "text"]}
                        </span>
                      </span>
                    </span>
                    <span className="grid justify-items-end gap-1 text-xs text-muted-foreground">
                      {formatDateTime(c.last_message_at)}
                      {c.unread > 0 ? (
                        <Badge data-testid="unread-badge">{t.unread(c.unread)}</Badge>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {hiddenCount ? (
        <p className="mt-4 text-sm">
          <Link
            href={showHidden ? "/beskeder" : "/beskeder?skjulte=1"}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {showHidden ? t.hideHiddenList : `${t.showHidden} (${hiddenCount})`}
          </Link>
        </p>
      ) : null}
    </>
  );
}
