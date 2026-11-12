import type { Metadata } from "next";
import { X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addManagerAction, removeManagerAction } from "@/lib/actions/departments";
import { fullName } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { CreateDepartmentForm } from "./forms";

export const metadata: Metadata = { title: "Afdelinger" };

export default async function DepartmentsPage() {
  const ctx = await requireContext(["admin", "manager"]);
  const isAdmin = ctx.role === "admin";
  const supabase = await createClient();
  const t = da.departments;

  const [
    { data: departments },
    { data: managers },
    { data: links },
    { data: managerMembers },
    { data: employees },
  ] = await Promise.all([
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("department_manager")
      .select("department_id, user_id")
      .eq("organization_id", ctx.organization.id),
    supabase
      .from("employee_department")
      .select("department_id, employee_id")
      .eq("organization_id", ctx.organization.id),
    supabase
      .from("membership")
      .select("user_id")
      .eq("organization_id", ctx.organization.id)
      .eq("role", "manager"),
    supabase
      .from("employee")
      .select("user_id, first_name, last_name")
      .eq("organization_id", ctx.organization.id)
      .not("user_id", "is", null),
  ]);

  const nameOf = (userId: string) => {
    const e = employees?.find((x) => x.user_id === userId);
    return e ? fullName(e) : userId.slice(0, 8);
  };
  const visible = (departments ?? []).filter(
    (d) => isAdmin || ctx.managedDepartmentIds.includes(d.id),
  );

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      {isAdmin ? (
        <Card className="mb-6">
          <CardContent>
            <CreateDepartmentForm />
          </CardContent>
        </Card>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((d) => {
            const deptManagers = (managers ?? []).filter((m) => m.department_id === d.id);
            const candidates = (managerMembers ?? []).filter(
              (m) => !deptManagers.some((x) => x.user_id === m.user_id),
            );
            const count = (links ?? []).filter((l) => l.department_id === d.id).length;
            return (
              <Card key={d.id} data-testid={`department-${d.name}`}>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{d.name}</h2>
                    <Badge variant="secondary" className="tabular">
                      {count} {t.employees.toLowerCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t.managers}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {deptManagers.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t.noManagers}</span>
                      ) : null}
                      {deptManagers.map((m) => (
                        <span
                          key={m.user_id}
                          className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground"
                        >
                          {nameOf(m.user_id)}
                          {isAdmin ? (
                            <form action={removeManagerAction}>
                              <input type="hidden" name="department_id" value={d.id} />
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <button
                                type="submit"
                                aria-label={`${t.removeManager} ${nameOf(m.user_id)}`}
                                className="grid size-5 place-items-center rounded-full hover:bg-black/10"
                              >
                                <X className="size-3" />
                              </button>
                            </form>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isAdmin && candidates.length ? (
                    <form action={addManagerAction} className="flex gap-2">
                      <input type="hidden" name="department_id" value={d.id} />
                      <div className="flex-1">
                        <NativeSelect name="user_id" aria-label={t.addManager} defaultValue="">
                          <option value="" disabled>
                            {t.addManager} …
                          </option>
                          {candidates.map((c) => (
                            <option key={c.user_id} value={c.user_id}>
                              {nameOf(c.user_id)}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <Button type="submit" variant="outline">
                        {da.common.save}
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
