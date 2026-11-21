import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { NewAgreementForm } from "@/components/agreements/agreement-actions";
import { todayIn } from "@/lib/domain/civil-date";

export const metadata: Metadata = { title: "Overenskomster" };

export default async function AgreementsPage() {
  const ctx = await requireContext(["agreements.manage"]);
  const supabase = await createClient();
  const t = da.agreements;
  const { data: agreements } = await supabase
    .from("agreement")
    .select(
      "id, name, kind, is_example, organization_id, description, agreement_version (version, valid_from, valid_to, status)",
    )
    .is("archived_at", null)
    .order("kind")
    .order("name");

  return (
    <>
      <PageHeader
        title={t.title}
        help={t.lead}
        actions={<NewAgreementForm defaultDate={todayIn(ctx.organization.timezone)} />}
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.name}</TableHead>
              <TableHead>{t.kind}</TableHead>
              <TableHead>{t.versions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(agreements ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link
                    href={`/indstillinger/overenskomster/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.name}
                  </Link>
                  {a.description ? (
                    <div className="text-xs text-muted-foreground">{a.description}</div>
                  ) : null}
                  <div className="mt-1 flex gap-1">
                    {a.organization_id === null ? (
                      <Badge variant="outline">{t.system}</Badge>
                    ) : null}
                    {a.is_example ? <Badge variant="warning">{t.example}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>{t.kinds[a.kind]}</TableCell>
                <TableCell className="text-sm tabular">
                  {a.agreement_version
                    .sort((x, y) => y.version - x.version)
                    .map((v) => (
                      <div key={v.version}>
                        v{v.version} · {t.validFrom.toLowerCase()} {formatDate(v.valid_from)}
                        {v.status !== "published" ? (
                          <Badge variant="outline" className="ml-2">
                            {v.status}
                          </Badge>
                        ) : null}
                      </div>
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
