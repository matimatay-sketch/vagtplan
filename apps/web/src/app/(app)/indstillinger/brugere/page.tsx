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
import { da } from "@/lib/i18n/da";
import { MemberProfileForm } from "./profile-select";

export const metadata: Metadata = { title: "Brugere" };

export default async function UsersPage() {
  const ctx = await requireContext(["users.manage"]);
  const supabase = await createClient();
  const t = da.users;
  const [{ data: members }, { data: profiles }, { data: responsible }, { data: departments }] =
    await Promise.all([
      supabase.rpc("organization_members", { org: ctx.organization.id }),
      supabase
        .from("permission_profile")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("department_manager")
        .select("user_id, department_id")
        .eq("organization_id", ctx.organization.id),
      supabase
        .from("department")
        .select("id, name")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null),
    ]);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.user}</TableHead>
              <TableHead>{t.profile}</TableHead>
              <TableHead>{t.departments}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((m) => {
              const name = m.first_name ? `${m.first_name} ${m.last_name}` : m.email;
              const depts = (responsible ?? []).filter((r) => r.user_id === m.user_id);
              return (
                <TableRow key={m.user_id} data-testid={`member-${m.email}`}>
                  <TableCell>
                    <div className="font-medium">
                      {m.employee_id ? (
                        <Link
                          href={`/medarbejdere/${m.employee_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                      {m.user_id === ctx.userId ? (
                        <span className="ml-2 text-xs text-muted-foreground">({t.you})</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell className="w-80">
                    <MemberProfileForm
                      userId={m.user_id}
                      profileId={m.profile_id}
                      profiles={profiles ?? []}
                      label={`${t.profile} – ${name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {depts.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t.noDepartments}</span>
                      ) : null}
                      {depts.map((d) => (
                        <Badge key={d.department_id} variant="secondary">
                          {deptName.get(d.department_id)}
                        </Badge>
                      ))}
                    </div>
                    <Link href="/afdelinger" className="text-xs text-primary hover:underline">
                      {da.common.edit}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
