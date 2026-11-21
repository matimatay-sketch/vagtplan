import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/help/help";
import { NewVersionForm } from "@/components/agreements/agreement-actions";
import { KitExtrasForm } from "@/components/platform/kit-extras-form";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { kitVersions, type KitContent } from "@/lib/domain/starter-kit";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Startpakke" };

export default async function StarterKitPage({ params }: PageProps<"/platform/startpakker/[key]">) {
  await requirePlatformAdmin();
  const { key } = await params;
  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("starter_kit")
    .select("key, name, content, edited_at")
    .eq("key", key)
    .maybeSingle();
  if (!kit) notFound();
  const content = kit.content as unknown as KitContent;
  const versions = kitVersions(content);
  const dates = versions.map((v) => v.valid_from).sort();
  const t = da.starterKits;
  const ta = da.agreements;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/platform" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {da.platform.title}
          </Link>
        }
        title={kit.name}
        help={t.lead}
        lead={
          <Badge variant={kit.edited_at ? "secondary" : "outline"}>
            {kit.edited_at ? t.edited : t.notEdited}
          </Badge>
        }
      />
      <div className="grid gap-6">
        <Card className="py-0">
          <table className="w-full text-sm" data-testid="kit-versions">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">{t.versions}</th>
                <th className="px-4 py-2 font-medium">{ta.validFrom}</th>
                <th className="px-4 py-2 font-medium">{ta.validTo}</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">v{v.version}</td>
                  <td className="px-4 py-2 tabular">{formatDate(v.valid_from)}</td>
                  <td className="px-4 py-2 tabular">{v.valid_to ? formatDate(v.valid_to) : "–"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/platform/startpakker/${kit.key}/v/${v.version}`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      aria-label={ta.openVersion(v.version)}
                    >
                      {ta.open}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <NewVersionForm kitKey={kit.key} defaultDate={addDays(todayIn(), 1)} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.extrasTitle} <HelpTip>{t.extrasHelp}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KitExtrasForm
              key={kit.edited_at ?? "seed"}
              kitKey={kit.key}
              dates={dates}
              supplementTypes={content.supplement_types ?? []}
              payPeriodGroups={content.pay_period_groups ?? []}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
