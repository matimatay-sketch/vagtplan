import { expect, test, type Page } from "@playwright/test";
import { login, users, openMoreSettings } from "./helpers";

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

async function openNewShift(page: Page, row: string, date: string) {
  const c = cell(page, row, date);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  return page.getByTestId("shift-form");
}

test("settings are admin-only by default", async ({ page }) => {
  await login(page, users.manager);
  await expect(
    page.getByRole("navigation", { name: "Hovedmenu" }).getByRole("link", { name: "Opsætning" }),
  ).toHaveCount(0);
  await page.goto("/indstillinger/opsaetning");
  await expect(page).toHaveURL(/adgang=nej/);
  await page.context().clearCookies();
  await login(page, users.admin);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Opsætning" })
    .click();
  const notice = page.getByTestId("notice-form");
  await notice.getByLabel("Nye vagter (timer før)").fill("24");
  await notice.getByLabel("Ændringer og aflysninger (timer før)").fill("12");
  await notice.getByRole("button", { name: "Gem" }).click();
  await expect(notice.getByText("Gemt")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("notice-form").getByLabel("Nye vagter (timer før)")).toHaveValue(
    "24",
  );
});

test("a rule set to 'override permanently' is still flagged but needs no reason", async ({
  page,
}) => {
  const week = mondayIn(13);
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const rules = page.getByTestId("rule-handling-form");
  await rules.getByLabel("Håndtering – Daglig hviletid").selectOption("allow");
  await rules.getByRole("button", { name: "Gem" }).click();
  await expect(rules.getByText("Gemt")).toBeVisible();
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  for (const [date, start, end] of [
    [week, "14:00", "22:00"],
    [plus(week, 1), "08:00", "16:00"],
  ] as const) {
    const form = await openNewShift(page, MADS, date);
    await form.getByLabel("Start").fill(start);
    await form.getByLabel("Slut").fill(end);
    await form.getByRole("button", { name: "Gem vagt" }).click();
    await expect(form).toHaveCount(0);
  }
  const tuesday = cell(page, MADS, plus(week, 1)).getByTestId("shift-card");
  await expect(tuesday.getByTestId("violation-warning")).toHaveAttribute(
    "title",
    /tilsidesat permanent/,
  );
  await page.getByTestId("publish-button").click();
  const dialog = page.getByTestId("publish-dialog");
  await expect(dialog.getByTestId("overridden-violations")).toContainText("hvile");
  await expect(dialog.getByTestId("blocking-violation")).toHaveCount(0);
  await dialog.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();
  await page.context().clearCookies();

  // Restore the default for other tests.
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  await page
    .getByTestId("rule-handling-form")
    .getByLabel("Håndtering – Daglig hviletid")
    .selectOption("");
  await page.getByTestId("rule-handling-form").getByRole("button", { name: "Gem" }).click();
  await expect(page.getByTestId("rule-handling-form").getByText("Gemt")).toBeVisible();
});

test("shift with paid and unpaid breaks and a supplement; hours shown against the norm", async ({
  page,
}) => {
  const week = mondayIn(14);
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const st = page.getByTestId("supplement-type-form");
  await st.getByLabel("Navn").fill("Ansvarstillæg");
  await st.getByLabel("Lønart").fill("ansvar");
  await st.getByLabel("Beløb / procent").fill("25,00");
  await st.getByRole("button", { name: "Opret tillæg" }).click();
  await expect(page.getByTestId("supplement-types")).toContainText("Ansvarstillæg");
  await expect(page.getByTestId("supplement-types")).toContainText("25,00 kr./t");
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const form = await openNewShift(page, MADS, week);
  const editor = form.getByTestId("breaks-editor");
  await editor.getByRole("button", { name: "Tilføj pause" }).click();
  const second = editor.getByTestId("break-row").nth(1);
  await second.getByLabel(/Tidspunkt/).fill("10:00");
  await second.getByLabel("Minutter").fill("15");
  await second.getByLabel("Betalt").selectOption("paid");
  await expect(editor).toContainText("Betalt: 15 min · Ubetalt: 30 min");
  await openMoreSettings(form);
  await form.getByTestId("supplement-picker").getByText("Ansvarstillæg").click();
  await form.getByRole("button", { name: "Gem vagt" }).click();
  await expect(form).toHaveCount(0);

  const card = cell(page, MADS, week).getByTestId("shift-card");
  await expect(card.getByTestId("supplement-badge")).toHaveText("+1");
  // Mads has a 25-hour contract; 8 hours minus 30 unpaid minutes = 7.5 hours.
  await expect(page.locator(`tr[data-row="${MADS}"]`).getByTestId("norm-hours")).toHaveText(
    "7,5 / 25 t",
  );

  await card.click();
  const edit = page.getByTestId("shift-form");
  await expect(edit.getByTestId("break-row")).toHaveCount(2);
  await expect(
    edit.getByTestId("supplement-picker").getByRole("checkbox", { name: /Ansvarstillæg/ }),
  ).toBeChecked();
});

test("turnus: build a 2-week rotation, roll it out, edit it and roll out again", async ({
  page,
}) => {
  const start = mondayIn(16);
  await login(page, users.manager);
  await page.goto("/vagtplan/turnus");
  const create = page.getByTestId("create-rotation");
  const name = `Kasse ${Date.now().toString(36)}`;
  await create.getByLabel("Navn").fill(name);
  await create.getByLabel("Type").selectOption("rotation");
  await create.getByLabel("Antal uger").fill("2");
  await create.getByRole("button", { name: "Ny skabelon" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const addSlot = async (line: string, weekday: number, from: string, to: string) => {
    const td = page.locator(`tr[data-line="${line}"] td[data-weekday="${weekday}"]`);
    await td.hover();
    await td.getByRole("button", { name: /Ny vagt/ }).click();
    const f = page.getByTestId("slot-form");
    await f.getByLabel("Start").fill(from);
    await f.getByLabel("Slut").fill(to);
    await f.getByRole("button", { name: "Gem" }).click();
    await expect(f).toHaveCount(0);
    await expect(td.getByTestId("rotation-slot")).toContainText(`${from}–${to}`);
  };

  await addSlot("Linje 1", 1, "08:00", "16:00");
  await page.getByRole("button", { name: "Tilføj linje" }).click();
  await expect(page.locator('tr[data-line="Linje 2"]')).toBeVisible();
  await addSlot("Linje 2", 3, "12:00", "20:00");
  await page.getByRole("tab", { name: /Uge 2/ }).click();
  await addSlot("Linje 1", 2, "10:00", "18:00");

  const rollout = page.getByTestId("rollout-form");
  await rollout.getByLabel("Første mandag").fill(start);
  await rollout.getByLabel("Antal uger").fill("4");
  await rollout.getByLabel("Medarbejder – Linje 1").selectOption({ label: MADS });
  await rollout.getByLabel("Medarbejder – Linje 2").selectOption({ label: "Ida Ung" });
  await rollout.getByRole("button", { name: "Udrul" }).click();
  // Line 1 (start week 1): Mon, Tue, Mon, Tue = 4. Line 2 (start week 2): Wed in weeks 2 and 4 = 2.
  await expect(page.getByText("6 vagter oprettet som kladde.")).toBeVisible();

  await page.goto(`/vagtplan?uge=${start}`);
  await expect(cell(page, MADS, start).getByTestId("shift-card")).toContainText("08:00–16:00");
  await page.goto(`/vagtplan?uge=${plus(start, 7)}`);
  await expect(cell(page, "Ida Ung", plus(start, 9)).getByTestId("shift-card")).toContainText(
    "12:00–20:00",
  );

  // Edit the template and roll out again.
  await page.goto("/vagtplan/turnus");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page
    .locator('tr[data-line="Linje 1"] td[data-weekday="1"]')
    .getByTestId("rotation-slot")
    .click();
  const f = page.getByTestId("slot-form");
  await f.getByLabel("Start").fill("09:00");
  await f.getByLabel("Slut").fill("17:00");
  await f.getByRole("button", { name: "Gem" }).click();
  await expect(f).toHaveCount(0);
  await page.getByTestId("rollout-history").getByRole("button", { name: "Udrul igen" }).click();
  await expect(page.getByText("6 vagter oprettet igen.")).toBeVisible();
  await page.goto(`/vagtplan?uge=${start}`);
  await expect(cell(page, MADS, start).getByTestId("shift-card")).toHaveCount(1);
  await expect(cell(page, MADS, start).getByTestId("shift-card")).toContainText("09:00–17:00");
});
