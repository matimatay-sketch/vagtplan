import type { Metadata } from "next";
import { HelpTip } from "@/components/help/help";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpenseForm, TripForm } from "@/components/expenses/expense-forms";
import { ExpenseList } from "@/components/expenses/expense-list";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { loadExpenseCategories, loadExpenseItems } from "@/lib/expenses/load";
import { loadPostingDimensions } from "@/lib/posting/load";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Kørsel og udlæg" };

export default async function ExpensesPage() {
  const ctx = await requireContext();
  if (!ctx.employee) redirect("/oversigt");
  const supabase = await createClient();
  const t = da.expenses;
  const today = todayIn(ctx.organization.timezone);
  const [categories, items, posting, { data: ownDepartments }] = await Promise.all([
    loadExpenseCategories(supabase, ctx.organization.id),
    loadExpenseItems(supabase, {
      from: addDays(today, -90),
      to: today,
      employeeId: ctx.employee.id,
    }),
    loadPostingDimensions(supabase),
    supabase.from("employee_department").select("department_id").eq("employee_id", ctx.employee.id),
  ]);
  // Only values available in all of the employee's departments.
  const deptIds = (ownDepartments ?? []).map((d) => d.department_id);
  const dims = posting
    .map((d) => ({
      ...d,
      values: d.values.filter(
        (v) => v.departmentIds.length === 0 || deptIds.every((x) => v.departmentIds.includes(x)),
      ),
    }))
    .filter((d) => d.values.length > 0);
  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t.tripsTitle}
              <HelpTip>{t.tripsLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TripForm today={today} posting={dims} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.expensesTitle}
              <HelpTip>{t.expensesLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseForm
              today={today}
              categories={categories.filter((c) => !c.archived)}
              posting={dims}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.listTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseList items={items} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
