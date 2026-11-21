import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgreementEditor } from "@/components/agreements/agreement-editor";
import { TestWeeks } from "@/components/agreements/test-weeks";
import { runTestWeeks } from "@/lib/agreements/test-weeks";
import { weekStartOf } from "@/lib/domain/schedule-time";
import {
  CopyAgreementButton,
  NewLocalForm,
  NewVersionForm,
  DeleteAgreementButton,
} from "@/components/agreements/agreement-actions";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Overenskomst" };

export default async function AgreementPage({
  params,
}: PageProps<"/indstillinger/overenskomster/[id]">) {
  const ctx = await requireContext(["agreements.manage"]);
  const { id } = await params;
  const supabase = await createClient();
  const t = da.agreements;
  const { data: a } = await supabase
    .from("agreement")
    .select(
      "id, key, name, kind, is_example, organization_id, archived_at, agreement_version (id, version, valid_from, valid_to, status, document)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!a || a.archived_at) notFound();
  const own = a.organization_id !== null;
  const versions = [...a.agreement_version].sort((x, y) => y.version - x.version);
  const draft = own ? versions.find((v) => v.status === "draft") : undefined;
  const latest = versions[0];
  const today = todayIn(ctx.organization.timezone);
  const { data: employees } = draft
    ? await supabase
        .from("employee")
        .select("id, first_name, last_name")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .order("first_name")
    : { data: [] };
  const tests = await runTestWeeks(supabase, ctx.organization.timezone, a.id);
  const { data: groupRows } = draft
    ? await supabase
        .from("contract")
        .select("staff_group")
        .eq("organization_id", ctx.organization.id)
        .not("staff_group", "is", null)
    : { data: [] };
  const staffGroups = [
    ...new Set((groupRows ?? []).map((g) => g.staff_group).filter((g): g is string => Boolean(g))),
  ];
  const inherits = (latest?.document as { inherits_from?: string | null } | undefined)
    ?.inherits_from;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/indstillinger/overenskomster"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={a.name}
        lead={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t.kinds[a.kind]}</Badge>
            {own ? (
              <Badge variant="secondary">{t.own}</Badge>
            ) : (
              <Badge variant="outline">{t.system}</Badge>
            )}
            {a.is_example ? <Badge variant="warning">{t.example}</Badge> : null}
            <span className="font-mono text-xs">{a.key}</span>
            {inherits ? (
              <span className="text-xs">
                {t.inherits}: <span className="font-mono">{inherits}</span>
              </span>
            ) : null}
          </span>
        }
        actions={
          !own ? (
            <CopyAgreementButton agreementId={a.id} />
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {a.kind !== "local" ? <NewLocalForm parentId={a.id} /> : null}
              <DeleteAgreementButton agreementId={a.id} name={a.name} />
            </span>
          )
        }
      />
      <div className="grid gap-6">
        <Card className="py-0">
          <table className="w-full text-sm" data-testid="agreement-versions">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">{t.versions}</th>
                <th className="px-4 py-2 font-medium">{t.validFrom}</th>
                <th className="px-4 py-2 font-medium">{t.validTo}</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">v{v.version}</td>
                  <td className="px-4 py-2 tabular">{formatDate(v.valid_from)}</td>
                  <td className="px-4 py-2 tabular">{v.valid_to ? formatDate(v.valid_to) : "–"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={v.status === "published" ? "default" : "outline"}>
                      {t.status[v.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {!own ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.readOnly}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(latest?.document, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : draft ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t.draft} v{draft.version}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AgreementEditor
                key={draft.id}
                versionId={draft.id}
                document={draft.document as never}
                employees={(employees ?? []).map((e) => ({
                  id: e.id,
                  name: `${e.first_name} ${e.last_name}`,
                }))}
                defaultDate={today}
                staffGroups={staffGroups}
              />
            </CardContent>
          </Card>
        ) : (
          <NewVersionForm agreementId={a.id} defaultDate={addDays(today, 1)} />
        )}
        <TestWeeks
          agreementId={a.id}
          initial={tests.results}
          hasDraft={tests.hasDraft}
          defaultWeek={weekStartOf(today)}
        />
      </div>
    </>
  );
}
