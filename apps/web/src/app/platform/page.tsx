import type { Metadata } from "next";
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
import { CustomerForm, InviteAdminForm } from "./customer-form";

export const metadata: Metadata = { title: "Kundeoversigt" };

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: customers, error } = await supabase.rpc("platform_organizations");
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
          <CustomerForm />
        </CardContent>
      </Card>

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
