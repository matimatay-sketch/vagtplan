import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PostingSettings } from "@/components/posting/posting-settings";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPostingDimensions } from "@/lib/posting/load";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Kontering" };

export default async function PostingPage() {
  await requireContext(["posting.manage"]);
  const supabase = await createClient();
  const [dimensions, { data: departments }] = await Promise.all([
    loadPostingDimensions(supabase),
    supabase.from("department").select("id, name").is("archived_at", null).order("name"),
  ]);
  return (
    <>
      <PageHeader title={da.posting.title} help={da.posting.lead} />
      <PostingSettings dimensions={dimensions} departments={departments ?? []} />
    </>
  );
}
