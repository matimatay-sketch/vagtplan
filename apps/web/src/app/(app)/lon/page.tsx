import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileCog } from "lucide-react";
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
import { periodFocus } from "@/lib/domain/pay-periods";
import { todayIn } from "@/lib/domain/civil-date";

export const metadata: Metadata = { title: "Løn" };

export default async function PayrollPage({ searchParams }: PageProps<"/lon">) {
  const ctx = await requireContext(["payroll.view", "payroll.manage"]);
  const supabase = await createClient();
  const t = da.payroll;
  const all = await loadPeriods(supabase, ctx);
  const showAll = (await searchParams).alle === "1";
  const focus = periodFocus(all, todayIn(ctx.organization.timezone));
  const periods = showAll ? all : focus.recent;
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
      {focus.now.length ? (
        <section className="mb-6 grid gap-3" aria-label={t.nowTitle} data-testid="pay-now">
          <h2 className="text-lg font-semibold">{t.nowTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {focus.now.map((p) => (
              <Link
                key={p.id}
                href={`/lon/${p.id}`}
                className="group grid gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/60"
              >
                <span className="text-sm text-muted-foreground">{p.groupName}</span>
                <span className="font-medium tabular">
                  {formatDate(p.start)} – {formatDate(p.end)}
                </span>
                <span
                  className={
                    p.state === "ready"
                      ? "text-sm font-medium text-warning-foreground"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {p.state === "ready" ? t.readyToRun : t.running(formatDate(p.end))}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {p.state === "ready" ? t.runNow : t.open}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {periods.length === 0 ? (
        <EmptyState
          action={
            hasOrg(ctx.permissions, "settings.manage")
              ? { href: "/indstillinger/lonperioder", label: da.nav.payPeriodGroups }
              : null
          }
        >
          {t.noPeriods}
        </EmptyState>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">{showAll ? t.allPeriods : t.recentPeriods}</h2>
          <Card className="py-0">
            <Table data-testid="pay-periods">
              <TableHeader>
                <TableRow>
                  <TableHead>{t.group}</TableHead>
                  <TableHead>{t.period}</TableHead>
                  <TableHead>{t.status}</TableHead>
                  <TableHead>
                    <span className="sr-only">{da.common.actions}</span>
                  </TableHead>
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
          {focus.older > 0 || showAll ? (
            <p className="mt-3 text-sm">
              <Link
                href={showAll ? "/lon" : "/lon?alle=1"}
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {showAll ? t.showRecent : t.showAll(focus.older)}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
