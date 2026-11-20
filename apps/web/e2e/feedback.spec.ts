import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, openMoreSettings, users } from "./helpers";

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
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const MADS = "Mads Medarbejder";

test("copy a shift to several days and a week to the next weeks", async ({ page }) => {
  const week = mondayIn(33);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, MADS, week);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const form = page.getByTestId("shift-form");
  await form.getByLabel("Start").fill("09:00");
  await form.getByLabel("Slut").fill("13:00");
  await form.getByRole("button", { name: "Gem vagt" }).click();
  await expect(form).toHaveCount(0);

  // The shift is copied to Wednesday and Friday, this week and the next.
  await c.getByTestId("shift-card").click();
  const copy = page.getByTestId("shift-form").getByTestId("copy-shift");
  await copy.getByText("Kopiér vagten").click();
  await copy.getByLabel(/ons/i).check();
  await copy.getByLabel(/fre/i).check();
  await copy.getByLabel("Gentag i").selectOption("2");
  await copy.getByRole("button", { name: "Kopiér (5)" }).click();
  await expect(page.getByText("5 vagter kopieret som kladde.")).toBeVisible();
  for (const d of [plus(week, 2), plus(week, 4)])
    await expect(cell(page, MADS, d).getByTestId("shift-card")).toContainText("09:00–13:00");

  // The whole week to the next 2 weeks: 3 shifts each.
  await page.getByTestId("copy-week").click();
  const dialog = page.getByTestId("copy-week-dialog");
  await dialog.getByLabel("Antal uger").selectOption("2");
  await dialog.getByRole("button", { name: "Kopiér" }).click();
  await expect(page.getByText("6 vagter kopieret som kladde.")).toBeVisible();
  // Next week: the copies of the shift and of the week, so two on Wednesday.
  await page.goto(`/vagtplan?uge=${plus(week, 7)}`);
  await expect(cell(page, MADS, plus(week, 9)).getByTestId("shift-card")).toHaveCount(2);
});

test("dashboard: bulletin board per department, shortcuts and counts on profiles", async ({
  page,
}) => {
  const title = `Vareoptælling ${Date.now().toString(36)}`;
  await login(page, users.manager);
  const board = page.getByTestId("bulletin-board");
  await board.getByRole("button", { name: "Nyt opslag" }).click();
  const form = page.getByTestId("bulletin-form");
  await form.getByLabel("Til").selectOption({ label: "Butik" });
  await form.getByLabel("Overskrift").fill(title);
  await form.getByLabel("Tekst").fill("Lørdag kl. 8. Husk varme sokker.");
  await form.getByLabel("Fastgør øverst").check();
  await form.getByRole("button", { name: "Slå op" }).click();
  await expect(board.getByTestId("bulletin-post").first()).toContainText(title);
  await page.context().clearCookies();

  // Ida (Butik) sees it, with the celebrations and her shortcuts.
  await login(page, users.young);
  await expect(page.getByTestId("bulletin-board")).toContainText(title);
  await expect(page.getByTestId("bulletin-board")).toContainText("Butik");
  await expect(page.getByTestId("celebrations")).toBeVisible();
  await expect(page.getByTestId("my-shifts")).toBeVisible();
  await expect(page.getByTestId("shortcuts")).toContainText("Fravær og ferie");
  await expect(page.getByText("kommer i de næste faser")).toHaveCount(0);
  await expect(
    page.getByTestId("bulletin-board").getByRole("button", { name: "Nyt opslag" }),
  ).toHaveCount(0);
  await page.context().clearCookies();

  // The profiles page counts employees without a login under the default profile.
  await login(page, users.admin);
  await page.goto("/indstillinger/rettigheder");
  await expect(page.getByText(/medarbejdere? uden login/)).toBeVisible();
});

test("log in as an employee without a login; actions are marked; back again", async ({ page }) => {
  await login(page, users.admin);
  // Carl Café has no login: one is created in the background, no e-mail is sent.
  await page.goto("/medarbejdere/50000000-0000-0000-0000-000000000004");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("impersonate").click();
  await expect(page).toHaveURL(/\/oversigt/);
  const banner = page.getByTestId("impersonation-banner");
  await expect(banner).toContainText("Du er logget ind som Carl Café (admin@demo.dk)");

  // As Carl: stamp in and out.
  await page.goto("/tid");
  const card = page.getByTestId("stamp-card");
  await card.getByRole("button", { name: "Stempl ind" }).click();
  await expect(card.getByTestId("stamp-status")).toContainText("Stemplet ind kl.");
  // Wait until the stamp has reached the server before stamping out.
  await expect(card.getByTestId("stamp-queue")).toHaveCount(0);
  await expect(card.getByTestId("stamp-status")).toContainText("Stemplet ind kl.");
  await card.getByRole("button", { name: "Stempl ud" }).click();
  await expect(card.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
  await expect(card.getByTestId("stamp-queue")).toHaveCount(0);
  // The registration reached the server: it waits for approval.
  await expect(page.getByTestId("time-entry").first()).toContainText("Afventer godkendelse");

  await banner.getByRole("button", { name: "Tilbage til min bruger" }).click();
  await expect(page).toHaveURL(/\/medarbejdere/);
  await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
  await expect(page.getByTestId("org-name")).toBeVisible();

  // The registration's history says it was done by the admin as Carl.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  await page.goto(`/tid/godkend?uge=${today}&q=Carl`);
  const row = page
    .locator('section[data-employee="Carl Café"]')
    .getByTestId("approval-row")
    .first();
  await row.getByRole("button", { name: /Redigér/ }).click();
  await page.getByTestId("entry-form").getByRole("button", { name: "Historik" }).click();
  await expect(page.getByTestId("entry-history")).toContainText(
    "(gjort af admin@demo.dk som medarbejderen)",
  );
});

async function setOnCallDefault(browser: Browser, percent: string) {
  // A separate session, so the test's own login is not disturbed.
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const form = page.getByTestId("norm-defaults-form");
  await form.getByLabel("Rådighed (%)").fill(percent);
  await form.getByRole("button", { name: "Gem" }).click();
  await expect(form.getByText("Gemt")).toBeVisible();
  await context.close();
}

test("norm percent: on-call counts with the default for its kind or its own share", async ({
  page,
  browser,
}) => {
  await setOnCallDefault(browser, "50");
  try {
    const week = mondayIn(36);
    await login(page, users.manager);
    await page.goto(`/vagtplan?uge=${week}`);
    const c = cell(page, MADS, week);
    await c.hover();
    await c.getByRole("button", { name: "Ny vagt" }).click();
    const form = page.getByTestId("shift-form");
    await form.getByLabel("Start").fill("08:00");
    await form.getByLabel("Slut").fill("16:30");
    await form.getByLabel("Type").selectOption("on_call");
    await openMoreSettings(form);
    await expect(form.getByLabel("Tæller i timenorm (%)")).toHaveAttribute(
      "placeholder",
      "Standard: 50 %",
    );
    await form.getByRole("button", { name: "Gem vagt" }).click();
    await expect(form).toHaveCount(0);
    const hours = page.locator(`tr[data-row="${MADS}"]`).getByTestId("norm-hours");
    // 8.5 hours minus a 30-minute unpaid break = 8 hours, at 50 % = 4 hours.
    await expect(hours).toHaveText("4 / 25 t");

    // Its own share wins over the default: 25 % of 8 hours = 2 hours.
    await c.getByTestId("shift-card").click();
    await openMoreSettings(form);
    await form.getByLabel("Tæller i timenorm (%)").fill("25");
    await form.getByLabel("Bruges, når lønnen finder overarbejde").selectOption("true");
    await form.getByRole("button", { name: "Gem vagt" }).click();
    await expect(form).toHaveCount(0);
    await expect(hours).toHaveText("2 / 25 t");
  } finally {
    await setOnCallDefault(browser, "0");
  }
});

test("help mode: the ? in the corner shows explanations on hover, and is remembered", async ({
  page,
}) => {
  await login(page, users.employee);
  await page.goto("/fravaer");
  const explain = page.getByRole("button", { name: "Forklaring: Fravær og ferie" });
  // Off by default: the explanation is not on the page.
  await expect(explain).toBeHidden();
  await expect(page.getByText("Søg om ferie og fri, og se hvor mange dage")).toHaveCount(0);

  await page.getByTestId("help-toggle").filter({ visible: true }).click();
  await expect(page.getByTestId("help-toggle").filter({ visible: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await explain.hover();
  await expect(page.getByTestId("help-content")).toContainText("Søg om ferie og fri");

  // Remembered on this device.
  await page.reload();
  await expect(explain).toBeVisible();
  await page.getByTestId("help-toggle").filter({ visible: true }).click();
  await expect(explain).toBeHidden();
});
