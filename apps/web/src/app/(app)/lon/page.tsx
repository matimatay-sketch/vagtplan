import type { Metadata } from "next";
import Link from "next/link";
import { FileCog } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { hasOrg } from "@/lib/permissions";
import { loadPeriods } from "@/lib/payroll/periods";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Løn" };

export default async function PayrollPage() {
  const ctx = await requireContext(["payroll.view", "payroll.manage"]);
  const supabase = await createClient();
  const t = da.payroll;
  const periods = await loadPeriods(supabase, ctx);
  return (
    <>
      <PageHeader
        title={t.title}
        lead={t.lead}
        actions={
          hasOrg(ctx.permissions, "payroll.manage") ? (
            <Button asChild variant="outline">
              <Link href="/lon/skabeloner">
                <FileCog /> {t.templates}
              </Link>
            </Button>
          ) : null
        }
      />
      {periods.length === 0 ? (
        <EmptyState>{t.noPeriods}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table data-testid="pay-periods">
            <TableHeader>
              <TableRow>
                <TableHead>{t.group}</TableHead>
                <TableHead>{t.period}</TableHead>
                <TableHead>{t.status}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id} data-period={`${p.groupName}|${p.start}`}>
                  <TableCell className="font-medium">{p.groupName}</TableCell>
                  <TableCell className="tabular">
                    {formatDate(p.start)} – {formatDate(p.end)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "closed" ? "secondary" : "outline"}>
                      {t.statuses[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/lon/${p.id}`}>{t.open}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
