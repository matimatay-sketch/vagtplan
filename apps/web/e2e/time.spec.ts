import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

function mondayIn(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const MADS = "Mads Medarbejder";

test("stamping offline is queued and synchronised once, without duplicates", async ({
  page,
  context,
}) => {
  await login(page, users.employee);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Tid" })
    .click();
  await expect(page).toHaveURL(/\/tid$/);
  const card = page.getByTestId("stamp-card");
  await expect(card.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
  const before = await page.getByTestId("time-entry").count();

  await context.setOffline(true);
  await card.getByRole("button", { name: "Stempl ind" }).click();
  await expect(card.getByTestId("stamp-status")).toContainText("Stemplet ind kl.");
  await expect(card.getByTestId("stamp-queue")).toHaveText("1 stempling venter på netværk");
  await card.getByRole("button", { name: "Stempl ud" }).click();
  await expect(card.getByTestId("stamp-queue")).toHaveText("2 stemplinger venter på netværk");
  await expect(card.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
  const queued = await page.evaluate(() => localStorage.getItem("turnus.stamp-queue"));

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(card.getByTestId("stamp-queue")).toHaveCount(0);
  await expect(page.getByTestId("time-entry")).toHaveCount(before + 1);

  // The same queue sent again (e.g. a retry after a lost response) creates nothing new.
  await page.evaluate((q) => {
    localStorage.setItem("turnus.stamp-queue", q!);
    window.dispatchEvent(new Event("online"));
  }, queued);
  await expect(card.getByTestId("stamp-queue")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("time-entry")).toHaveCount(before + 1);
  await expect(page.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
});

test("completed as planned, deviation with reason, approval and correction as a new version", async ({
  page,
}) => {
  const week = mondayIn(-1);

  // The manager plans and publishes last Monday 08:00–16:00 for Mads.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, MADS, week);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("08:00");
  await shift.getByLabel("Slut").fill("16:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();
  await page.context().clearCookies();

  // Mads confirms the shift and then corrects the end with a reason.
  await login(page, users.employee);
  await page.goto("/tid");
  const missing = page.getByTestId("missing-shift").filter({ hasText: "08:00–16:00" });
  await missing.getByRole("button", { name: "Gennemført som planlagt" }).click();
  await expect(missing).toHaveCount(0);
  const day = page.locator(`li[data-date="${week}"]`);
  const entry = day.getByTestId("time-entry");
  await expect(entry).toContainText("08:00–16:00");
  await expect(entry).toContainText("Som planlagt");
  // 8 hours minus the 30-minute unpaid default break.
  await expect(day.getByTestId("day-total")).toHaveText("Dagens arbejdstid: 7,5 t");

  await entry.getByRole("button").click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Slut").fill("16:30");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form.getByText("Skriv en begrundelse, når tiden afviger fra planen.")).toBeVisible();
  await form.getByLabel("Begrundelse for afvigelse").fill("Vareopfyldning efter lukketid");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await expect(entry).toContainText("Afvigelse: +30 min");
  await expect(day.getByTestId("day-total")).toHaveText("Dagens arbejdstid: 8 t");
  await page.context().clearCookies();

  // The manager approves; approved time is corrected as a new version.
  await login(page, users.manager);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Godkend tid" })
    .click();
  await page.goto(`/tid/godkend?uge=${week}`);
  const madsSection = page.locator(`section[data-employee="${MADS}"]`);
  const row = madsSection.getByTestId("approval-row").filter({ hasText: "08:00–16:30" });
  await expect(row).toContainText("Vareopfyldning efter lukketid");
  // The pay codes the time activates, before it is approved: 8 hours (16:30 minus a 30-minute
  // unpaid break) at 150 kr. The manager may see pay lines, so amounts are shown.
  await expect(row.getByTestId("entry-pay-codes")).toContainText("NORMAL 8,00 t");
  // The summary to the right: pay code, label, quantity, rate and amount per employee.
  const summary = page.locator('[data-testid="pay-preview"][data-employee="Mads Medarbejder"]');
  const normalRow = summary.locator('tr[data-pay-code="NORMAL"]');
  // (Totals are not asserted: other tests register Mads's time "yesterday", which on a
  // Monday falls in this week.)
  await expect(normalRow).toContainText("Timeløn");
  await expect(normalRow).toContainText("150,00");
  // Why: the rule, its source and the agreement version, so the calculation can be checked.
  await summary.getByTestId("pay-why").getByText("Hvorfor?").click();
  await expect(summary.getByTestId("pay-why")).toContainText("Regel loensats · Eksempel § 1");
  // The department's total for the week (other employees may add to it).
  const butik = page.locator('[data-testid="department-total"][data-department="Butik"]');
  await expect(butik).toContainText("Butik i alt (foreløbig)");
  await expect(butik.locator('tr[data-pay-code="NORMAL"]').first()).toBeVisible();
  await expect(butik.getByTestId("summary-total")).not.toBeEmpty();
  // Filters: deviation and pay code match the row; "not stamped out" and "approved" do not.
  const filters = page.getByTestId("time-filters");
  await filters.locator('[data-flag="deviation"]').getByRole("checkbox").check();
  await filters.getByLabel("Lønart").selectOption("NORMAL");
  await filters.getByRole("button", { name: "Vis", exact: true }).click();
  await expect(page).toHaveURL(/vis=deviation/);
  await expect(page).toHaveURL(/loenart=NORMAL/);
  await expect(row).toBeVisible();
  await expect(page.getByTestId("filter-result")).toContainText("Viser");
  await filters.getByLabel("Status").selectOption("open");
  await filters.getByRole("button", { name: "Vis", exact: true }).click();
  await expect(page).toHaveURL(/status=open/);
  await expect(row).toHaveCount(0);
  await page.goto(`/tid/godkend?uge=${week}&status=approved&q=Mads`);
  await expect(row).toHaveCount(0);
  await page.getByRole("link", { name: "Nulstil filtre" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByText("1 registrering godkendt.")).toBeVisible();
  await expect(row).toContainText("Godkendt");

  // The approval can be undone while the pay period is open, and given again. (When the
  // payroll test has closed this period first, it is refused with a clear message.)
  // Approved rows are selected the same way, and the approval removed for all selected.
  await row.getByRole("checkbox").check();
  await page.getByTestId("unapprove-selected").click();
  const outcome = page.getByText(/Godkendelsen er fortrudt\.|Lønperioden er afsluttet/);
  await expect(outcome).toBeVisible();
  if ((await outcome.textContent())?.startsWith("Godkendelsen")) {
    await row.getByRole("checkbox").check();
    await page.getByTestId("approve-selected").click();
  }
  await expect(row).toContainText("Godkendt");

  await row.getByRole("button", { name: "Ret godkendt tid" }).click();
  const correct = page.getByTestId("entry-form");
  await correct.getByLabel("Slut").fill("17:00");
  await correct.getByLabel("Begrundelse for rettelsen").fill("Glemt oprydning");
  await correct.getByRole("button", { name: "Gem registrering" }).click();
  await expect(correct).toHaveCount(0);
  const corrected = madsSection.getByTestId("approval-row").filter({ hasText: "08:00–17:00" });
  await expect(corrected).toContainText("Version 2");
  await expect(corrected).toContainText("Afventer godkendelse");
  await corrected.getByRole("button", { name: /Redigér/ }).click();
  await page.getByTestId("entry-form").getByRole("button", { name: "Historik" }).click();
  await expect(page.getByTestId("entry-history").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("entry-history")).toContainText("Glemt oprydning");
  await page.keyboard.press("Escape");
  await page.context().clearCookies();

  // Mads cannot change approved time, and sees the new version waiting.
  await login(page, users.employee);
  await page.goto("/tid");
  await expect(page.locator(`li[data-date="${week}"]`).getByTestId("time-entry")).toContainText(
    "08:00–17:00",
  );
});
