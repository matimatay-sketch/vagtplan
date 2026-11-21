import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NewMessageForm } from "@/components/messages/forms";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Ny besked" };

export default async function NewMessagePage({ searchParams }: PageProps<"/beskeder/ny">) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: recipients } = await supabase.rpc("message_recipients", {
    p_org: ctx.organization.id,
  });
  const t = da.messages;
  const preselected = typeof sp.til === "string" ? [sp.til] : [];
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/beskeder" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {t.back}
          </Link>
        }
        title={t.newMessage}
        help={t.lead}
      />
      {(recipients ?? []).length === 0 ? (
        <EmptyState>{t.noRecipients}</EmptyState>
      ) : (
        <Card>
          <CardContent>
            <NewMessageForm recipients={recipients ?? []} preselected={preselected} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
