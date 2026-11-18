import type { Metadata } from "next";
import { loadPostingDimensions } from "@/lib/posting/load";
import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { canInDepartment } from "@/lib/permissions";
import { archiveTemplateAction } from "@/lib/actions/schedule";
import { da } from "@/lib/i18n/da";
import { normDefaultsFrom } from "@/lib/domain/norm-percent";
import type { TemplateBreak } from "@/lib/domain/breaks";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Vagtskabeloner" };

export default async function TemplatesPage() {
  const ctx = await requireContext(["schedule.manage"]);
  const supabase = await createClient();
  const t = da.schedule;
  const [
    { data: templates },
    { data: departments },
    { data: supplementTypes },
    postingDimensions,
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("shift_template")
      .select(
        "id, name, start_time, end_time, breaks, supplement_type_ids, posting_values, label, kind, norm_percent, norm_in_pay, department_id",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("start_time"),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("supplement_type")
      .select("id, name, amount_type, amount")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    loadPostingDimensions(supabase),
    supabase
      .from("organization_settings")
      .select("norm_percent_work, norm_percent_on_call, norm_in_pay_work, norm_in_pay_on_call")
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
  ]);
  const normDefaults = normDefaultsFrom(settings);
  const valueName = new Map(
    postingDimensions.flatMap((d) => d.values.map((v) => [v.id, `${v.code} · ${v.name}`] as const)),
  );
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const manageable = (departments ?? []).filter((d) =>
    canInDepartment(ctx.permissions, "schedule.manage", d.id, ctx.responsibleDepartmentIds),
  );
  const orgWide = ctx.permissions["schedule.manage"] === "organization";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/vagtplan" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={t.templates}
        lead={t.templatesLead}
      />
      <Card className="mb-6">
        <CardContent>
          <TemplateForm
            normDefaults={normDefaults}
            departments={manageable}
            allowOrgWide={orgWide}
            supplementTypes={(supplementTypes ?? []).map((x) => ({
              id: x.id,
              name: x.name,
              amountType: x.amount_type,
              amount: x.amount,
            }))}
            posting={postingDimensions}
          />
        </CardContent>
      </Card>
      {(templates ?? []).length === 0 ? (
        <EmptyState>{t.noTemplate}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.templateName}</TableHead>
                <TableHead>
                  {t.start}–{t.end}
                </TableHead>
                <TableHead>{t.breakMinutes}</TableHead>
                <TableHead>{t.department}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates ?? []).map((tpl) => (
                <TableRow key={tpl.id}>
                  <TableCell className="font-medium">
                    {tpl.name}
                    {tpl.label ? (
                      <span className="ml-2 text-muted-foreground">{tpl.label}</span>
                    ) : null}
                    {Object.values((tpl.posting_values ?? {}) as Record<string, string>).map(
                      (id) => (
                        <Badge key={id} variant="outline" className="ml-2">
                          {valueName.get(id) ?? "?"}
                        </Badge>
                      ),
                    )}
                    {tpl.kind === "on_call" ? (
                      <Badge variant="secondary" className="ml-2">
                        {t.kinds.on_call}
                      </Badge>
                    ) : null}
                    {tpl.norm_percent !== null ? (
                      <Badge variant="outline" className="ml-2" data-testid="template-norm">
                        {t.normOfShift(tpl.norm_percent)}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular">
                    {tpl.start_time.slice(0, 5)}–{tpl.end_time.slice(0, 5)}
                  </TableCell>
                  <TableCell className="tabular">
                    {(tpl.breaks as unknown as TemplateBreak[])
                      .map(
                        (b) =>
                          `${b.minutes}${b.start_time ? ` (${b.start_time.slice(0, 5)})` : ""}${b.paid ? " betalt" : ""}`,
                      )
                      .join(", ") || "–"}
                  </TableCell>
                  <TableCell>
                    {tpl.department_id ? deptName.get(tpl.department_id) : t.allDepartments}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={archiveTemplateAction}>
                      <input type="hidden" name="id" value={tpl.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label={`${da.common.archive} ${tpl.name}`}
                      >
                        <Trash2 />
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
