import type { Metadata } from "next";
import { SubmitButton } from "@/components/form";
import { X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { requireContext } from "@/lib/auth";
import { hasOrg } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addManagerAction, removeManagerAction } from "@/lib/actions/departments";
import { da } from "@/lib/i18n/da";
import { CreateDepartmentForm, DepartmentMessagingForm } from "./forms";
import { emailConfigured } from "@/lib/messages/email";
import { PostingDefaultsForm } from "@/components/posting/posting-defaults";
import { loadPostingDimensions } from "@/lib/posting/load";
import type { PostingValues } from "@/lib/domain/posting";

export const metadata: Metadata = { title: "Afdelinger" };

export default async function DepartmentsPage() {
  const ctx = await requireContext(["departments.manage", "users.manage", "employees.view"]);
  const canCreate = hasOrg(ctx.permissions, "departments.manage");
  const canAssign = hasOrg(ctx.permissions, "users.manage");
  const seesAll = canCreate || canAssign || hasOrg(ctx.permissions, "employees.view");
  const supabase = await createClient();
  const t = da.departments;

  const [
    { data: departments },
    { data: responsible },
    { data: links },
    members,
    { data: orgSettings },
  ] = await Promise.all([
    supabase
      .from("department")
      .select(
        "id, name, posting_defaults, swap_requires_approval, message_email, availability_enabled, open_shift_requires_approval",
      )
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
    canAssign
      ? supabase.rpc("organization_members", { org: ctx.organization.id }).then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase
      .from("organization_settings")
      .select("availability_enabled")
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
  ]);
  const organizationAvailability = orgSettings?.availability_enabled ?? true;

  const dimensions = canCreate ? await loadPostingDimensions(supabase) : [];
  const nameOf = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    if (!m) return t.responsiblePerson;
    return m.first_name ? `${m.first_name} ${m.last_name}` : m.email;
  };
  const visible = (departments ?? []).filter(
    (d) => seesAll || ctx.responsibleDepartmentIds.includes(d.id),
  );

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      {canCreate ? (
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
            const people = (responsible ?? []).filter((m) => m.department_id === d.id);
            const candidates = members.filter((m) => !people.some((x) => x.user_id === m.user_id));
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
                      {people.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t.noManagers}</span>
                      ) : null}
                      {people.map((m) => (
                        <span
                          key={m.user_id}
                          className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground"
                        >
                          {nameOf(m.user_id)}
                          {canAssign ? (
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
                  {canCreate ? (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {t.messagingTitle}
                      </p>
                      <DepartmentMessagingForm
                        id={d.id}
                        name={d.name}
                        swapRequiresApproval={d.swap_requires_approval}
                        messageEmail={d.message_email}
                        availability={d.availability_enabled}
                        organizationAvailability={organizationAvailability}
                        openShiftApproval={d.open_shift_requires_approval}
                      />
                      {d.message_email && !emailConfigured() ? (
                        <p className="mt-2 text-xs text-muted-foreground">{t.emailNotConfigured}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {canCreate && dimensions.length ? (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {da.posting.defaults}
                      </p>
                      <PostingDefaultsForm
                        kind="department"
                        id={d.id}
                        departmentId={d.id}
                        dimensions={dimensions}
                        value={d.posting_defaults as PostingValues}
                      />
                    </div>
                  ) : null}
                  {canAssign && candidates.length ? (
                    <form action={addManagerAction} className="flex gap-2">
                      <input type="hidden" name="department_id" value={d.id} />
                      <div className="flex-1">
                        <NativeSelect
                          name="user_id"
                          aria-label={`${t.addManager} – ${d.name}`}
                          defaultValue=""
                        >
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
                      <SubmitButton variant="outline">{da.common.save}</SubmitButton>
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
