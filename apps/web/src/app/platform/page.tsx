import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setCustomerArchivedAction } from "@/lib/actions/platform";
import { formatDate } from "@/lib/format";
import { localParts } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";
import { ApplyStarterKitForm, CustomerForm, InviteAdminForm } from "./customer-form";

export const metadata: Metadata = { title: "Kundeoversigt" };

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: customers, error }, { data: kits }] = await Promise.all([
    supabase.rpc("platform_organizations"),
    supabase.from("starter_kit").select("key, name, edited_at").order("name"),
  ]);
  if (error) throw new Error(error.message);
  const t = da.platform;

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">{t.newCustomer}</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm kits={kits ?? []} />
        </CardContent>
      </Card>

      {(kits ?? []).length ? (
        <Card className="mb-8" data-testid="starter-kits">
          <CardHeader>
            <CardTitle className="text-base">{da.starterKits.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {(kits ?? []).map((k) => (
                <li key={k.key} className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{k.name}</span>
                  <Badge variant={k.edited_at ? "secondary" : "outline"}>
                    {k.edited_at ? da.starterKits.edited : da.starterKits.notEdited}
                  </Badge>
                  <Button asChild variant="outline" size="sm" className="ml-auto">
                    <Link href={`/platform/startpakker/${k.key}`}>{da.starterKits.open}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">{t.customers}</h2>
      {(customers ?? []).length === 0 ? (
        <EmptyState>{t.none}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table data-testid="customer-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t.customerName}</TableHead>
                <TableHead>{t.admins}</TableHead>
                <TableHead className="text-right">{t.users}</TableHead>
                <TableHead className="text-right">{t.employees}</TableHead>
                <TableHead>{t.createdAt}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(customers ?? []).map((c) => (
                <TableRow key={c.id} data-customer={c.name} className="align-top">
                  <TableCell className="font-medium">
                    {c.name}
                    {c.archived_at ? (
                      <Badge variant="secondary" className="ml-2">
                        {t.archived}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-72">
                    <div className="grid gap-2">
                      {c.owner_emails.length ? (
                        <ul className="text-sm">
                          {c.owner_emails.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-sm text-destructive">{t.noAdmin}</span>
                      )}
                      {c.archived_at ? null : <InviteAdminForm organizationId={c.id} />}
                      {c.archived_at || !(kits ?? []).length ? null : (
                        <ApplyStarterKitForm organizationId={c.id} kits={kits ?? []} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{c.member_count}</TableCell>
                  <TableCell className="text-right tabular">{c.employee_count}</TableCell>
                  <TableCell className="tabular">
                    {formatDate(localParts(c.created_at).date)}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={setCustomerArchivedAction}>
                      <input type="hidden" name="organization_id" value={c.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={c.archived_at ? "false" : "true"}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={`${c.archived_at ? t.reactivate : t.archive} ${c.name}`}
                      >
                        {c.archived_at ? t.reactivate : t.archive}
                      </Button>
                    </form>
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
