import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Clock, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireContext } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { findActiveContract } from "@/lib/domain/contracts";
import { todayIn } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Oversigt" };

export default async function OverviewPage({ searchParams }: PageProps<"/oversigt">) {
  const ctx = await requireContext();
  const { adgang } = await searchParams;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.overview;

  const [{ data: employees }, { count: departmentCount }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, contract (valid_from, valid_to)")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null),
    supabase
      .from("department")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null),
  ]);
  const list = employees ?? [];
  const withActive = list.filter((e) => findActiveContract(e.contract, today)).length;
  const firstName = ctx.employee?.first_name ?? ctx.email.split("@")[0] ?? "";

  const stats = hasAny(ctx.permissions, ["employees.view", "employees.manage"])
    ? [
        { label: t.employees, value: list.length, href: "/medarbejdere" },
        { label: t.departments, value: departmentCount ?? 0, href: "/afdelinger" },
        {
          label: t.activeContracts,
          value: withActive,
          href: "/medarbejdere",
          note:
            list.length - withActive > 0
              ? `${list.length - withActive} ${t.missingContract}`
              : undefined,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={ctx.organization.name}
        title={t.greeting(firstName)}
        lead={ctx.profile.name}
      />
      {adgang === "nej" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{da.common.notAllowed}</AlertDescription>
        </Alert>
      ) : null}
      {stats.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <CardDescription>{s.label}</CardDescription>
                  <CardTitle className="font-display text-4xl tabular">{s.value}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className={s.note ? "text-warning-foreground" : undefined}>
                    {s.note ?? " "}
                  </span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { icon: Clock, title: "Stempling", text: "Fase 4" },
          { icon: Wallet, title: "Løn og eksport", text: "Fase 6" },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block font-medium text-foreground">{title}</span>
              {text}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {hasAny(ctx.permissions, ["schedule.view", "schedule.manage"]) ? (
          <Button asChild variant="signal">
            <Link href="/vagtplan">
              <CalendarClock /> {da.nav.schedule}
            </Link>
          </Button>
        ) : null}
        {ctx.employee ? (
          <Button asChild variant="outline">
            <Link href="/min-vagtplan">
              <CalendarClock /> {da.nav.mySchedule}
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{t.comingSoon}</p>
    </>
  );
}
