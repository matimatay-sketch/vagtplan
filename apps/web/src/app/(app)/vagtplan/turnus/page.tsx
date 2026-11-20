import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Repeat } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment } from "@/lib/permissions";
import { da } from "@/lib/i18n/da";
import { CreateRotationForm } from "./create-form";

export const metadata: Metadata = { title: "Turnus" };

export default async function RotationsPage() {
  const ctx = await requireContext(["schedule.manage"]);
  const supabase = await createClient();
  const t = da.turnus;
  const [{ data: rotations }, { data: departments }] = await Promise.all([
    supabase
      .from("rotation")
      .select("id, name, length_weeks, department_id, rotation_line (id), rotation_slot (id)")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);
  const manageable = (departments ?? []).filter((d) =>
    canInDepartment(ctx.permissions, "schedule.manage", d.id, ctx.responsibleDepartmentIds),
  );
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/vagtplan" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {da.schedule.title}
          </Link>
        }
        title={t.title}
        help={t.lead}
      />
      <Card className="mb-6">
        <CardContent>
          <CreateRotationForm departments={manageable} />
        </CardContent>
      </Card>
      {(rotations ?? []).length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(rotations ?? []).map((r) => (
            <Link key={r.id} href={`/vagtplan/turnus/${r.id}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardContent className="grid gap-2">
                  <span className="flex items-center gap-2 font-display text-lg font-semibold">
                    <Repeat className="size-4 text-signal" /> {r.name}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {r.length_weeks === 1 ? t.weekTemplate : t.rotation(r.length_weeks)}
                    </Badge>
                    <Badge variant="outline">{deptName.get(r.department_id)}</Badge>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.summary(r.rotation_line.length, r.rotation_slot.length)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
