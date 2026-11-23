import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

function mondayIn(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const plus = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Easter Sunday (anonymous Gregorian algorithm). */
function easter(y: number): string {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4;
  const f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** Danish public holidays (and days some agreements treat as such) in a year. */
function holidays(y: number): string[] {
  const e = easter(y);
  return [
    ...[-3, -2, 0, 1, 39, 49, 50].map((n) => plus(e, n)),
    ...["01-01", "05-01", "06-05", "12-24", "12-25", "12-26", "12-31"].map((md) => `${y}-${md}`),
  ];
}
/** The first Monday from `weeks` ahead whose Monday–Friday has no holiday. */
function mondayWithoutHolidays(weeks: number): string {
  for (let w = weeks; ; w++) {
    const monday = mondayIn(w);
    const days = [0, 1, 2, 3, 4].map((n) => plus(monday, n));
    const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
    const all = years.flatMap(holidays);
    if (!days.some((d) => all.includes(d))) return monday;
  }
}
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const MADS = "Mads Medarbejder";

test("vacation request: the manager approves, the balance and the schedule follow", async ({
  page,
}) => {
  // A week without public holidays, far enough ahead not to clash with other tests.
  const week = mondayWithoutHolidays(23);
  const friday = plus(week, 4);
  const wednesday = plus(week, 2);

  // The manager has planned Mads on Wednesday.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, MADS, wednesday);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("08:00");
  await shift.getByLabel("Slut").fill("16:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.context().clearCookies();

  // Mads requests the week off.
  await login(page, users.employee);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Fravær og ferie" })
    .click();
  await expect(page.getByTestId("balance-cards")).toBeVisible();
  const form = page.getByTestId("absence-request-form");
  await form.getByLabel("Type").selectOption({ label: "Ferie" });
  await form.getByLabel("Fra").fill(week);
  await form.getByLabel("Til").fill(friday);
  await form.getByLabel(/Bemærkning/).fill("Påskeferie efter påske");
  await form.getByRole("button", { name: "Send ansøgning" }).click();
  await expect(page.getByText("Ansøgningen er sendt.")).toBeVisible();
  const mine = page
    .getByTestId("my-absences")
    .getByTestId("absence-row")
    .filter({ hasText: "Påskeferie" });
  await expect(mine).toContainText("Afventer");
  await page.context().clearCookies();

  // The manager sees the request on the schedule and approves it.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  await expect(cell(page, MADS, wednesday).getByTestId("absence-chip")).toContainText("afventer");
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Godkend fravær" })
    .click();
  const request = page
    .getByTestId("pending-absences")
    .getByTestId("absence-row")
    .filter({ hasText: MADS });
  await request.getByRole("textbox").fill("God ferie");
  await request.getByRole("button", { name: "Godkend" }).click();
  await expect(page.getByText("Fraværet er godkendt.")).toBeVisible();
  await expect(
    page.getByTestId("upcoming-absences").getByTestId("absence-row").filter({ hasText: MADS }),
  ).toContainText("5 dage");

  // The schedule shows the absence and flags the planned shift as uncovered.
  await page.goto(`/vagtplan?uge=${week}`);
  await expect(cell(page, MADS, wednesday).getByTestId("absence-chip")).toHaveText("Ferie");
  await expect(cell(page, MADS, wednesday).getByTestId("uncovered-badge")).toBeVisible();
  await expect(page.getByTestId("uncovered-alert")).toContainText("1 vagt er udækket pga. fravær");
  await page.context().clearCookies();

  // Mads sees the approval and the days drawn from the balance.
  await login(page, users.employee);
  await page.goto("/fravaer");
  await expect(mine).toContainText("Godkendt");
  await expect(mine).toContainText("5 dage");
  await expect(mine).toContainText("God ferie");
  // The details (earned, used, transferred) are one click away.
  await page.getByText("Se detaljer").click();
  await expect(
    page.getByTestId("balances").locator('tr[data-account="vacation"]').last(),
  ).toContainText("5");
});

test("a call-out is registered as its own kind", async ({ page }) => {
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Copenhagen",
  });
  await login(page, users.employee);
  await page.goto("/tid");
  await page.getByRole("button", { name: "Registrér tid" }).click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Type").selectOption("call_out");
  await form.getByLabel("Dato").fill(yesterday);
  await form.getByLabel("Start").fill("22:00");
  await form.getByLabel("Slut").fill("23:30");
  await form.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await form.getByLabel("Begrundelse for afvigelse").fill("Alarm i butikken");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  const entry = page
    .locator(`li[data-date="${yesterday}"]`)
    .getByTestId("time-entry")
    .filter({ hasText: "22:00–23:30" });
  await expect(entry.getByTestId("call-out-badge")).toHaveText("Tilkald");
});

test("the consultant's leave settings apply: payouts can be switched off", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const rules = page.getByTestId("leave-rules-form");
  await rules.getByLabel("Udbetaling af ferie").selectOption("false");
  // Holidays reduce the norm by the planned shift instead of the agreement's choice.
  await rules.getByLabel("Helligdage nedsætter normen med").selectOption("planned_shift");
  await rules.getByRole("button", { name: "Gem" }).click();
  await expect(rules.getByText("Gemt")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("leave-rules-form").getByLabel("Udbetaling af ferie")).toHaveValue(
    "false",
  );
  await expect(
    page.getByTestId("leave-rules-form").getByLabel("Helligdage nedsætter normen med"),
  ).toHaveValue("planned_shift");
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto("/fravaer/godkend");
  const posting = page.getByTestId("posting-form");
  await posting.getByLabel("Medarbejder").selectOption({ label: MADS });
  await posting.getByLabel("Konto").selectOption({ index: 2 });
  await posting.getByLabel("Postering").selectOption("payout");
  await posting.getByLabel("Dage").fill("1");
  await posting.getByLabel("Bemærkning").fill("Udbetaling ved fratræden");
  await posting.getByRole("button", { name: "Tilføj postering" }).click();
  await expect(
    posting.getByText("Udbetaling af ferie er ikke tilladt i opsætningen eller overenskomsten."),
  ).toBeVisible();
  await page.context().clearCookies();

  // Back to following the agreement.
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  await page.getByTestId("leave-rules-form").getByLabel("Udbetaling af ferie").selectOption("");
  await page
    .getByTestId("leave-rules-form")
    .getByLabel("Helligdage nedsætter normen med")
    .selectOption("");
  await page.getByTestId("leave-rules-form").getByRole("button", { name: "Gem" }).click();
  await expect(page.getByTestId("leave-rules-form").getByText("Gemt")).toBeVisible();
});
