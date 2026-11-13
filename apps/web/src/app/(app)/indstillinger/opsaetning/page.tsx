import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatSupplementAmount } from "@/components/schedule/breaks-editor";
import { requireContext } from "@/lib/auth";
import { hasOrg } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { archiveSupplementTypeAction } from "@/lib/actions/settings";
import { loadOrganizationSettings } from "@/lib/schedule/validate-week";
import { da } from "@/lib/i18n/da";
import { NoticeForm, RuleHandlingForm, SupplementTypeForm } from "./forms";

export const metadata: Metadata = { title: "Opsætning" };

export default async function SettingsPage() {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const t = da.settings;
  const [settings, { data: supplements }] = await Promise.all([
    loadOrganizationSettings(supabase, ctx.organization.id),
    supabase
      .from("supplement_type")
      .select("id, name, pay_code, amount_type, amount")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);
  const links = [
    { href: "/indstillinger/lonperioder", label: da.nav.payPeriodGroups, show: true },
    {
      href: "/indstillinger/overenskomster",
      label: da.nav.agreements,
      show: hasOrg(ctx.permissions, "agreements.manage"),
    },
    {
      href: "/indstillinger/rettigheder",
      label: da.nav.profiles,
      show: hasOrg(ctx.permissions, "users.manage"),
    },
    {
      href: "/vagtplan/skabeloner",
      label: da.nav.templates,
      show: Boolean(ctx.permissions["schedule.manage"]),
    },
  ].filter((l) => l.show);

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.noticeTitle}</CardTitle>
            <CardDescription>{t.noticeLead}</CardDescription>
          </CardHeader>
          <CardContent>
            <NoticeForm
              publish={settings.notice_publish_hours}
              change={settings.notice_change_hours}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.rulesTitle}</CardTitle>
            <CardDescription>{t.rulesLead}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert variant="warning">
              <AlertDescription>{t.rulesWarning}</AlertDescription>
            </Alert>
            <RuleHandlingForm handling={settings.rule_handling} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.supplementsTitle}</CardTitle>
            <CardDescription>{t.supplementsLead}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SupplementTypeForm />
            <ul className="grid gap-2" data-testid="supplement-types">
              {(supplements ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noSupplements}</li>
              ) : null}
              {(supplements ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{s.name}</span> ·{" "}
                    {formatSupplementAmount({ amountType: s.amount_type, amount: s.amount })}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {s.pay_code}
                    </span>
                  </span>
                  <form action={archiveSupplementTypeAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`${da.common.archive} ${s.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.more}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {links.map((l) => (
              <Button key={l.href} asChild variant="outline">
                <Link href={l.href}>
                  {l.label} <ArrowRight />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
