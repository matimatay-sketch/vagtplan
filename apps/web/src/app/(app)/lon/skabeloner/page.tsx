import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TemplateEditor } from "@/components/payroll/template-editor";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgreements } from "@/lib/engine";
import { exportSettingsSchema } from "@/lib/domain/export";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Eksportskabeloner" };

export default async function TemplatesPage({ searchParams }: PageProps<"/lon/skabeloner">) {
  const ctx = await requireContext(["payroll.manage"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const t = da.payroll;
  const [{ data: templates }, agreements, { data: supplements }] = await Promise.all([
    supabase
      .from("export_template")
      .select("id, name, settings")
      .is("archived_at", null)
      .order("name"),
    loadAgreements(supabase),
    supabase
      .from("supplement_type")
      .select("pay_code, name")
      .eq("organization_id", ctx.organization.id),
  ]);
  // Pay codes from the agreements and the organization's shift supplements.
  const codes = new Map<string, string>();
  for (const docs of Object.values(agreements.registry))
    for (const doc of docs)
      for (const [code, v] of Object.entries(doc.pay_codes))
        if (!codes.has(code)) codes.set(code, v.label);
  for (const s of supplements ?? []) if (!codes.has(s.pay_code)) codes.set(s.pay_code, s.name);
  // Absence types (for templates with absence): vacation, feriefridage and the agreements' types.
  codes.set("vacation", da.payroll.absenceCodes.vacation);
  codes.set("extra", da.payroll.absenceCodes.extra);
  for (const docs of Object.values(agreements.registry))
    for (const doc of docs)
      for (const r of doc.rules)
        if (r.primitive === "absence")
          for (const type of (r.params as { types?: { code: string; label: string }[] }).types ??
            [])
            if (!codes.has(type.code)) codes.set(type.code, type.label);
  const payCodes = [...codes]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const chosen = typeof sp.skabelon === "string" ? sp.skabelon : (templates?.[0]?.id ?? "ny");
  const current = templates?.find((x) => x.id === chosen) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/lon" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={t.templates}
        help={t.templatesLead}
      />
      <Alert className="mb-6">
        <AlertDescription>{t.presetMissing}</AlertDescription>
      </Alert>
      <div className="mb-4 flex flex-wrap gap-2" data-testid="template-list">
        {(templates ?? []).map((x) => (
          <Button key={x.id} asChild size="sm" variant={x.id === chosen ? "default" : "outline"}>
            <Link href={`/lon/skabeloner?skabelon=${x.id}`}>{x.name}</Link>
          </Button>
        ))}
        <Button
          asChild
          size="sm"
          variant={chosen === "ny" ? "default" : "outline"}
          className={cn()}
        >
          <Link href="/lon/skabeloner?skabelon=ny">
            <Plus /> {t.newTemplate} ({t.presets.generic})
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent>
          <TemplateEditor
            key={current?.id ?? "ny"}
            id={current?.id ?? null}
            name={current?.name ?? ""}
            settings={current ? exportSettingsSchema.parse(current.settings) : null}
            payCodes={payCodes}
          />
        </CardContent>
      </Card>
    </>
  );
}
