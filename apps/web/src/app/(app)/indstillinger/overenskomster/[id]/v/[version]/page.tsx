import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AgreementEditor, type EditorTarget } from "@/components/agreements/agreement-editor";
import { NewVersionForm } from "@/components/agreements/agreement-actions";
import { inheritanceFor } from "@/lib/agreements/inherited";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Overenskomstversion" };

/**
 * One version of an agreement: every rule, supplement and pay code. A published
 * version of an own agreement is changed here directly while no closed pay
 * period has used it; otherwise it is shown read-only.
 */
export default async function AgreementVersionPage({
  params,
}: PageProps<"/indstillinger/overenskomster/[id]/v/[version]">) {
  const ctx = await requireContext(["agreements.manage"]);
  const { id, version } = await params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) notFound();
  const supabase = await createClient();
  const t = da.agreements;
  const { data: a } = await supabase
    .from("agreement")
    .select("id, name, organization_id, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (!a || a.archived_at) notFound();
  const { data: v } = await supabase
    .from("agreement_version")
    .select("id, version, valid_from, valid_to, status, document")
    .eq("agreement_id", a.id)
    .eq("version", n)
    .maybeSingle();
  if (!v) notFound();
  // A draft is edited on the agreement's page.
  if (v.status === "draft") redirect(`/indstillinger/overenskomster/${a.id}`);
  const own = a.organization_id !== null;
  const { data: editable } = own
    ? await supabase.rpc("agreement_version_editable", { p_id: v.id })
    : { data: false };
  const target: EditorTarget = editable ? { kind: "published", versionId: v.id } : { kind: "view" };
  const { data: employees } = editable
    ? await supabase
        .from("employee")
        .select("id, first_name, last_name")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .order("first_name")
    : { data: [] };
  const { data: groupRows } = editable
    ? await supabase
        .from("contract")
        .select("staff_group")
        .eq("organization_id", ctx.organization.id)
        .not("staff_group", "is", null)
    : { data: [] };
  const staffGroups = [
    ...new Set((groupRows ?? []).map((g) => g.staff_group).filter((g): g is string => Boolean(g))),
  ];
  const today = todayIn(ctx.organization.timezone);
  const inheritance = await inheritanceFor(
    supabase,
    v.document as { inherits_from?: string | null; valid_from: string },
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/indstillinger/overenskomster/${a.id}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {a.name}
          </Link>
        }
        title={`${a.name} – ${t.version(v.version)}`}
        help={editable ? t.versionEditable : undefined}
        lead={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{t.status[v.status]}</Badge>
            <span className="tabular">
              {t.versionPeriod(
                formatDate(v.valid_from),
                v.valid_to ? formatDate(v.valid_to) : null,
              )}
            </span>
          </span>
        }
      />
      <div className="grid gap-6">
        {own && !editable ? (
          <Card data-testid="version-locked">
            <CardContent className="grid gap-3">
              <p className="flex items-center gap-2 font-medium">
                <Lock className="size-4" aria-hidden /> {t.versionLockedTitle}
              </p>
              <p className="text-sm text-muted-foreground">{t.versionLocked}</p>
              <NewVersionForm agreementId={a.id} defaultDate={addDays(today, 1)} />
            </CardContent>
          </Card>
        ) : !own ? (
          <p className="text-sm text-muted-foreground">{t.readOnly}</p>
        ) : null}
        <AgreementEditor
          key={v.id}
          target={target}
          document={v.document as never}
          employees={(employees ?? []).map((e) => ({
            id: e.id,
            name: `${e.first_name} ${e.last_name}`,
          }))}
          defaultDate={today}
          staffGroups={staffGroups}
          {...inheritance}
        />
      </div>
    </>
  );
}
