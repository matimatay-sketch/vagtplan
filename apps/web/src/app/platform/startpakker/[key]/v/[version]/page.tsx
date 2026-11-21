import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AgreementEditor } from "@/components/agreements/agreement-editor";
import { inheritanceFor } from "@/lib/agreements/inherited";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/civil-date";
import type { KitContent } from "@/lib/domain/starter-kit";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Startpakke – version" };

/** One agreement version in a starter kit, edited with the agreement editor. */
export default async function StarterKitVersionPage({
  params,
}: PageProps<"/platform/startpakker/[key]/v/[version]">) {
  await requirePlatformAdmin();
  const { key, version } = await params;
  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("starter_kit")
    .select("key, name, content, edited_at")
    .eq("key", key)
    .maybeSingle();
  if (!kit) notFound();
  const content = kit.content as unknown as KitContent;
  const doc = content.agreement.versions.find((v) => v.version === Number(version));
  if (!doc) notFound();
  const t = da.agreements;
  const inheritance = await inheritanceFor(supabase, doc);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/platform/startpakker/${kit.key}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {kit.name}
          </Link>
        }
        title={`${content.agreement.name} – ${t.version(doc.version)}`}
        help={da.starterKits.lead}
        lead={
          <span className="tabular">
            {t.versionPeriod(
              formatDate(doc.valid_from),
              doc.valid_to ? formatDate(doc.valid_to) : null,
            )}
          </span>
        }
      />
      <AgreementEditor
        key={`${doc.version}-${kit.edited_at ?? "seed"}`}
        target={{ kind: "kit", kitKey: kit.key, version: doc.version }}
        document={doc as never}
        defaultDate={todayIn()}
        {...inheritance}
      />
    </>
  );
}
