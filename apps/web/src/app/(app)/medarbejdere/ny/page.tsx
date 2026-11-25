import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeForm } from "@/components/employees/employee-form";
import { canIn, requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createEmployeeAction } from "@/lib/actions/employees";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Ny medarbejder" };

export default async function NewEmployeePage() {
  const ctx = await requireContext(["employees.manage"]);
  const supabase = await createClient();
  const [{ data }, { data: groups }] = await Promise.all([
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("employee_group")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);
  const departments = (data ?? []).filter((d) => canIn(ctx, "employees.manage", d.id));
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/medarbejdere"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {da.employees.title}
          </Link>
        }
        title={da.employees.new}
      />
      <Card className="max-w-3xl">
        <CardContent>
          <EmployeeForm
            action={createEmployeeAction}
            departments={departments}
            groups={groups ?? []}
            submitLabel={da.common.create}
          />
        </CardContent>
      </Card>
    </>
  );
}
