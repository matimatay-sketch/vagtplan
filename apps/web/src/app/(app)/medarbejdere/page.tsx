import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
import { ageOn } from "@/lib/domain/age";
import { findActiveContract } from "@/lib/domain/contracts";
import { todayIn } from "@/lib/domain/civil-date";
import { formatWeeklyHours, fullName } from "@/lib/format";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Medarbejdere" };

export default async function EmployeesPage({ searchParams }: PageProps<"/medarbejdere">) {
  const ctx = await requireContext(["admin", "manager"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const dept = typeof sp.afdeling === "string" ? sp.afdeling : "";
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const t = da.employees;

  const [{ data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("employee")
      .select(
        "id, employee_number, first_name, last_name, birth_date, school_obligated, user_id, employee_department (department_id, is_primary), contract (valid_from, valid_to, weekly_norm_minutes, pay_form)",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("last_name"),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);

  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const rows = (employees ?? []).filter((e) => {
    if (dept && !e.employee_department.some((l) => l.department_id === dept)) return false;
    if (q && !`${e.first_name} ${e.last_name} ${e.employee_number}`.toLowerCase().includes(q))
      return false;
    return true;
  });
  const selectableDepts = (departments ?? []).filter(
    (d) => ctx.role === "admin" || ctx.managedDepartmentIds.includes(d.id),
  );

  return (
    <>
      <PageHeader
        title={t.title}
        lead={t.lead}
        actions={
          <Button asChild variant="signal">
            <Link href="/medarbejdere/ny">
              <Plus /> {t.new}
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={t.search}
            aria-label={t.search}
            className="pl-9"
          />
        </div>
        <div className="sm:w-56">
          <NativeSelect name="afdeling" defaultValue={dept} aria-label={t.department}>
            <option value="">{t.filterAll}</option>
            {selectableDepts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Filtrér
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.name}</TableHead>
                <TableHead>{t.number}</TableHead>
                <TableHead>{t.departments}</TableHead>
                <TableHead>{t.age}</TableHead>
                <TableHead>{da.contracts.weeklyHours}</TableHead>
                <TableHead>{t.login}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const age = ageOn(e.birth_date, today);
                const active = findActiveContract(e.contract, today);
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link
                        href={`/medarbejdere/${e.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {fullName(e)}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {e.employee_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {[...e.employee_department]
                          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                          .map((l) => (
                            <Badge
                              key={l.department_id}
                              variant={l.is_primary ? "secondary" : "outline"}
                            >
                              {deptName.get(l.department_id) ?? "–"}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="tabular">
                      <span className="inline-flex items-center gap-2">
                        {age}
                        {age < 18 ? <Badge variant="warning">{t.youngWorker}</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular">
                      {active ? (
                        <>
                          {formatWeeklyHours(active.weekly_norm_minutes)}
                          <span className="ml-1 text-muted-foreground">
                            · {da.contracts.payForms[active.pay_form]}
                          </span>
                        </>
                      ) : (
                        <Badge variant="destructive">{t.noActiveContract}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.user_id ? "success" : "outline"}>
                        {e.user_id ? t.hasLogin : t.noLogin}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
