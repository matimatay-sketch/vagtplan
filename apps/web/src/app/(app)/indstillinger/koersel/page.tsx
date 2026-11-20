import type { Metadata } from "next";
import { SubmitButton } from "@/components/form";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { archiveExpenseSetupAction } from "@/lib/actions/expenses";
import { loadExpenseCategories, loadMileageRates } from "@/lib/expenses/load";
import { formatKroner } from "@/lib/domain/numbers";
import { da } from "@/lib/i18n/da";
import { ExpenseCategoryForm, MileageRateForm } from "./forms";

export const metadata: Metadata = { title: "Kørsel og udlæg" };

function ArchiveButton({ table, id, label }: { table: string; id: string; label: string }) {
  return (
    <form action={archiveExpenseSetupAction}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="icon" className="size-7" aria-label={label}>
        <Trash2 />
      </SubmitButton>
    </form>
  );
}

export default async function ExpenseSettingsPage() {
  const ctx = await requireContext(["expenses.manage"]);
  const supabase = await createClient();
  const t = da.expenses;
  const [rates, categories] = await Promise.all([
    loadMileageRates(supabase, ctx.organization.id),
    loadExpenseCategories(supabase, ctx.organization.id),
  ]);
  return (
    <>
      <PageHeader title={t.settingsTitle} lead={t.settingsLead} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.ratesTitle}</CardTitle>
            <CardDescription>{t.ratesLead}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <MileageRateForm />
            <ul className="grid gap-2" data-testid="mileage-rates">
              {rates.length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noRates}</li>
              ) : null}
              {rates.map((r) => (
                <li
                  key={r.id}
                  data-year={r.year}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{r.year}</span> ·{" "}
                    {t.rateSummary(
                      formatKroner(r.highRateOre),
                      r.highLimitKm.toLocaleString("da-DK"),
                      formatKroner(r.lowRateOre),
                    )}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {r.payCodeHigh} / {r.payCodeLow}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t.rateSource}: {r.source}
                    </span>
                  </span>
                  <ArchiveButton
                    table="mileage_rate"
                    id={r.id}
                    label={`${da.common.archive} ${r.year}`}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.categoriesTitle}</CardTitle>
            <CardDescription>{t.categoriesLead}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ExpenseCategoryForm />
            <ul className="grid gap-2" data-testid="expense-categories">
              {categories.filter((c) => !c.archived).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noCategories}</li>
              ) : null}
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {c.payCode}
                      </span>
                      {c.receiptRequired ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t.receiptRequiredShort}
                        </span>
                      ) : null}
                    </span>
                    <ArchiveButton
                      table="expense_category"
                      id={c.id}
                      label={`${da.common.archive} ${c.name}`}
                    />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
