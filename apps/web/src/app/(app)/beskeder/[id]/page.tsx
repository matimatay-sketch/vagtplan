import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, EyeOff, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SwapCard } from "@/components/messages/swap-card";
import { CancellationCard } from "@/components/messages/cancellation-card";
import {
  MarkRead,
  MessagesRealtime,
  OwnMessageActions,
  ReplyForm,
} from "@/components/messages/forms";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hideConversationAction } from "@/lib/actions/messages";
import { loadShiftItems } from "@/lib/messages/load";
import { formatDateTime } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Besked" };

export default async function ConversationPage({ params }: PageProps<"/beskeder/[id]">) {
  const ctx = await requireContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const t = da.messages;
  const [{ data: conversation }, { data: messages }, { data: people }, { data: me }] =
    await Promise.all([
      supabase.from("conversation").select("id, subject").eq("id", id).maybeSingle(),
      supabase
        .from("message")
        .select(
          "id, sender_id, kind, body, swap_id, cancellation_id, created_at, edited_at, archived_at",
        )
        .eq("conversation_id", id)
        .order("created_at"),
      supabase.rpc("conversation_people", { p_conversation_id: id }),
      supabase
        .from("conversation_participant")
        .select("last_read_at")
        .eq("conversation_id", id)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    ]);
  if (!conversation) notFound();
  const list = messages ?? [];
  const { swaps, cancellations } = await loadShiftItems(
    supabase,
    [...new Set(list.filter((m) => m.kind === "swap" && m.swap_id).map((m) => m.swap_id!))],
    [
      ...new Set(
        list
          .filter((m) => m.kind === "cancellation" && m.cancellation_id)
          .map((m) => m.cancellation_id!),
      ),
    ],
  );
  const nameOf = new Map((people ?? []).map((p) => [p.user_id, p.name]));
  const others = (people ?? []).filter((p) => p.user_id !== ctx.userId).map((p) => p.name);
  const lastRead = me?.last_read_at ?? null;
  const unread = list.some(
    (m) => m.sender_id !== ctx.userId && (!lastRead || m.created_at > lastRead),
  );

  return (
    <>
      <MessagesRealtime conversationId={id} />
      <MarkRead conversationId={id} unread={unread} />
      <PageHeader
        eyebrow={
          <Link href="/beskeder" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {t.back}
          </Link>
        }
        title={conversation.subject ?? (others.join(", ") || t.noSubject)}
        lead={`${t.people}: ${others.join(", ") || t.you}`}
        actions={
          <form action={hideConversationAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outline" size="sm" title={t.hideHelp}>
              <EyeOff /> {t.hide}
            </Button>
          </form>
        }
      />
      <ol className="mb-6 grid gap-3" data-testid="messages" aria-live="polite">
        {list.map((m) => {
          const mine = m.sender_id === ctx.userId;
          if (m.kind === "system") {
            const text =
              (m.swap_id ? da.swap.system[m.body] : da.cancellation.system[m.body]) ?? m.body;
            return (
              <li
                key={m.id}
                className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"
                data-testid="system-message"
              >
                <Info className="size-3.5" aria-hidden /> {text} · {formatDateTime(m.created_at)}
              </li>
            );
          }
          const swap = m.swap_id ? swaps.get(m.swap_id) : undefined;
          const canc = m.cancellation_id ? cancellations.get(m.cancellation_id) : undefined;
          return (
            <li
              key={m.id}
              className={cn("group grid max-w-[46rem] gap-1", mine ? "justify-self-end" : "")}
              data-testid="message"
            >
              <span
                className={cn(
                  "flex items-center gap-2 text-xs text-muted-foreground",
                  mine && "justify-end",
                )}
              >
                <span className="font-medium text-foreground">
                  {mine ? t.you : (nameOf.get(m.sender_id ?? "") ?? t.system)}
                </span>
                {formatDateTime(m.created_at)}
                {m.edited_at && !m.archived_at ? <span>({t.edited})</span> : null}
                {mine && m.kind === "text" && !m.archived_at ? (
                  <OwnMessageActions id={m.id} body={m.body} />
                ) : null}
              </span>
              {swap ? <SwapCard swap={swap} /> : null}
              {canc ? <CancellationCard item={canc} /> : null}
              {m.archived_at ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground italic">
                  {t.deleted}
                </p>
              ) : m.body ? (
                <p
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.body}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <Card>
        <CardContent>
          <ReplyForm conversationId={id} />
        </CardContent>
      </Card>
    </>
  );
}
