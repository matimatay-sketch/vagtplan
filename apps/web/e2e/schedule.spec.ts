import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

/** Monday `weeks` weeks from now (far enough ahead to satisfy notice rules). */
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

async function createShift(
  page: Page,
  row: string,
  date: string,
  start: string,
  end: string,
  breakMinutes = "30",
) {
  const c = cell(page, row, date);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const form = page.getByTestId("shift-form");
  await form.getByLabel("Start").fill(start);
  await form.getByLabel("Slut").fill(end);
  // The dialog starts with one unplaced 30-minute break.
  const rows = form.getByTestId("break-row");
  if (breakMinutes === "0") await rows.first().getByRole("button", { name: "Fjern pause" }).click();
  else await rows.first().getByLabel("Minutter").fill(breakMinutes);
  await form.getByRole("button", { name: "Gem vagt" }).click();
  await expect(form).toHaveCount(0);
  await expect(c.getByTestId("shift-card").filter({ hasText: start })).toBeVisible();
}

const MADS = "Mads Medarbejder";

/** The board updates at once; wait until the move/resize is actually stored. */
const saved = (page: Page) => expect(page.locator("body[data-schedule-saving]")).toHaveCount(0);

test("manager plans a week, overrides a blocking rule with a reason and publishes; the employee sees it", async ({
  page,
}) => {
  const week = mondayIn(6);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  await createShift(page, MADS, week, "14:00", "22:00");
  await createShift(page, MADS, plus(week, 1), "08:00", "16:00");

  // 10 hours of rest between the shifts → blocking on Tuesday's shift.
  const tuesday = cell(page, MADS, plus(week, 1)).getByTestId("shift-card");
  await expect(tuesday.getByTestId("violation-blocking")).toBeVisible();
  await expect(tuesday).toHaveAttribute("data-status", "draft");

  await page.getByTestId("publish-button").click();
  const dialog = page.getByTestId("publish-dialog");
  await expect(dialog.getByTestId("blocking-violation")).toContainText("hvile");
  await expect(dialog.getByTestId("confirm-publish")).toBeDisabled();
  await dialog.getByRole("textbox").first().fill("Aftalt med Mads – bytte af vagt");
  await dialog.getByTestId("confirm-publish").click();
  await expect(page.getByText("Vagtplanen er offentliggjort (2 vagter).")).toBeVisible();
  await expect(tuesday).toHaveAttribute("data-status", "published");
  await expect(page.getByTestId("publish-button")).toBeDisabled();
  await page.context().clearCookies();

  await login(page, users.employee);
  await page.goto(`/min-vagtplan?uge=${week}`);
  await expect(page.getByTestId("my-shift")).toHaveCount(2);
  await expect(page.getByTestId("my-shift").first()).toContainText("14:00–22:00");
});

test("an employee sees the next published shift on the overview", async ({ page }) => {
  // Tomorrow in Copenhagen, at an hour no other test uses.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const tomorrow = plus(today, 1);
  const monday = plus(tomorrow, -((new Date(`${tomorrow}T00:00:00Z`).getUTCDay() + 6) % 7));
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${monday}&visning=uge`);
  await createShift(page, MADS, tomorrow, "05:00", "06:00");
  await page.getByTestId("publish-button").click();
  const dialog = page.getByTestId("publish-dialog");
  for (const reason of await dialog.getByTestId("override-reason").all())
    await reason.fill("Oversigten viser vagten");
  await dialog.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();
  await page.context().clearCookies();

  await login(page, users.employee);
  await expect(page.getByTestId("my-shifts")).toContainText("05:00–06:00");
});

test("a shift across the spring DST change is shown and validated with real time", async ({
  page,
}) => {
  await login(page, users.manager);
  await page.goto("/vagtplan?uge=2027-03-22");
  await createShift(page, MADS, "2027-03-27", "14:00", "22:00");
  await createShift(page, MADS, "2027-03-28", "09:00", "15:00", "0");
  const sunday = cell(page, MADS, "2027-03-28").getByTestId("shift-card");
  // Wall clock says 11 hours of rest, but 28 March 2027 has only 23 hours.
  await expect(sunday.getByTestId("violation-blocking")).toHaveAttribute("title", /10 t/);

  await createShift(page, "Lise Leder", "2027-03-27", "22:00", "06:00", "30");
  await expect(cell(page, "Lise Leder", "2027-03-27").getByTestId("shift-card")).toContainText(
    "22:00–06:00 (+1)",
  );

  await page.goto("/vagtplan?uge=2027-03-22&visning=dag&dag=2027-03-28");
  await expect(
    page.getByTestId("day-board").locator('[data-row="Lise Leder"] [data-testid="day-bar"]'),
  ).toContainText("22:00–06:00");
});

test("young worker rules apply automatically", async ({ page }) => {
  const week = mondayIn(7);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  await createShift(page, "Ida Ung", week, "08:00", "17:00");
  const card = cell(page, "Ida Ung", week).getByTestId("shift-card");
  await expect(card.getByTestId("violation-blocking")).toHaveAttribute("title", /15–17 år/);
});

test("drag and drop moves a shift, Alt copies it, and the day view resizes it", async ({
  page,
}, testInfo) => {
  // A retry gets its own week: the first attempt's shifts stay behind.
  const week = mondayIn(8 + 20 * testInfo.retry);
  const wed = plus(week, 2);
  const thu = plus(week, 3);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  await createShift(page, MADS, wed, "08:00", "12:00", "0");

  const drag = async (from: string, to: string, alt = false) => {
    const card = cell(page, MADS, from).getByTestId("shift-card").first();
    const a = (await card.boundingBox())!;
    const b = (await cell(page, MADS, to).boundingBox())!;
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 12 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    await saved(page);
  };

  await drag(wed, thu);
  await expect(cell(page, MADS, thu).getByTestId("shift-card")).toHaveCount(1);
  await expect(cell(page, MADS, wed).getByTestId("shift-card")).toHaveCount(0);
  await page.reload(); // the move is persisted
  await expect(cell(page, MADS, thu).getByTestId("shift-card")).toHaveCount(1);
  await expect(cell(page, MADS, wed).getByTestId("shift-card")).toHaveCount(0);

  await drag(thu, wed, true);
  await expect(cell(page, MADS, wed).getByTestId("shift-card")).toHaveCount(1);
  await expect(cell(page, MADS, thu).getByTestId("shift-card")).toHaveCount(1);

  await page.goto(`/vagtplan?uge=${week}&visning=dag&dag=${thu}`);
  const bar = page.getByTestId("day-board").locator(`[data-row="${MADS}"] [data-testid="day-bar"]`);
  await expect(bar).toContainText("08:00–12:00");
  const row = (await page
    .getByTestId("day-board")
    .locator(`[data-row="${MADS}"] > div`)
    .last()
    .boundingBox())!;
  const handle = (await bar.getByTestId("resize-end").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + row.width / 24,
    handle.y + handle.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await saved(page);
  await expect(bar).toContainText("08:00–13:00");
  await page.reload();
  await expect(
    page.getByTestId("day-board").locator(`[data-row="${MADS}"] [data-testid="day-bar"]`),
  ).toContainText("08:00–13:00");
});

test("copy previous week and use a shift template", async ({ page }) => {
  const week = mondayIn(9);
  await login(page, users.manager);
  await page.goto("/vagtplan/skabeloner");
  const name = `Morgen ${Date.now().toString(36)}`;
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Start").fill("06:00");
  await page.getByLabel("Slut").fill("14:00");
  await page.getByRole("button", { name: "Ny skabelon" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, MADS, week);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const form = page.getByTestId("shift-form");
  await form.getByLabel("Skabelon").selectOption({ label: `${name} (06:00–14:00)` });
  await expect(form.getByLabel("Start")).toHaveValue("06:00");
  await form.getByRole("button", { name: "Gem vagt" }).click();
  await expect(c.getByTestId("shift-card")).toContainText("06:00–14:00");

  await page.goto(`/vagtplan?uge=${plus(week, 7)}`);
  await page.getByTestId("copy-week").click();
  await page.getByTestId("copy-week-dialog").getByLabel("Kopiér forrige uge hertil").check();
  await page.getByTestId("copy-week-dialog").getByRole("button", { name: "Kopiér" }).click();
  await expect(page.getByText("1 vagter kopieret som kladde.")).toBeVisible();
  await expect(cell(page, MADS, plus(week, 7)).getByTestId("shift-card")).toContainText(
    "06:00–14:00",
  );
});

test("the built-in proposal fills the week from the templates by the employees' norms", async ({
  page,
}) => {
  // Week 50 ahead: no other test uses it.
  const week = mondayIn(50);
  await login(page, users.manager);
  await page.goto("/vagtplan/skabeloner");
  const name = `Dag ${Date.now().toString(36)}`;
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Start").fill("08:00");
  await page.getByLabel("Slut").fill("16:00");
  await page.getByRole("button", { name: "Ny skabelon" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

  await page.goto(`/vagtplan?uge=${week}&visning=uge`);
  await page.getByTestId("auto-schedule-button").click();
  const dialog = page.getByTestId("auto-schedule-dialog");
  // Only the new template (other tests make templates too); Monday to Friday is chosen already.
  for (const box of await dialog
    .getByRole("group", { name: "Vagtskabeloner" })
    .getByRole("checkbox")
    .all())
    await box.uncheck();
  await dialog.getByLabel(new RegExp(name)).check();
  await dialog.getByTestId("auto-schedule-make").click();
  await expect(page.getByText(/kladdevagter oprettet/)).toBeVisible();

  const banner = page.getByTestId("proposal-banner");
  await expect(banner).toContainText("vagter fra et forslag");
  // The template gets the default 30-minute unpaid break: 7.5 hours a shift.
  // Lise (37 t) gets five shifts, Mads (25 t) three, Ida (8 t) one.
  await expect(banner).toContainText("Lise Leder: 37,5 af 37 t");
  await expect(banner).toContainText("Mads Medarbejder: 22,5 af 25 t");
  await expect(banner).toContainText("Ida Ung: 7,5 af 8 t");
  await expect(cell(page, "Lise Leder", week).getByTestId("shift-card")).toContainText(
    "08:00–16:00",
  );
  await expect(page.getByTestId("proposal-badge").first()).toHaveText("Forslag");
  // No shifts on the weekend, which was not chosen.
  await expect(cell(page, "Lise Leder", plus(week, 5)).getByTestId("shift-card")).toHaveCount(0);

  // The proposal can be discarded as a whole.
  await banner.getByRole("button", { name: "Kassér forslaget" }).click();
  await expect(page.getByText("Forslaget er kasseret.")).toBeVisible();
  await expect(page.getByTestId("proposal-badge")).toHaveCount(0);
});

test("an employee registers a wish for a day off and the manager sees it", async ({ page }) => {
  const week = mondayIn(11);
  const day = plus(week, 2);
  await login(page, users.employee);
  await page.goto("/min-vagtplan");
  const form = page.getByTestId("availability-form");
  await form.getByLabel("Dato").fill(day);
  await form.getByLabel("Type").selectOption("wish_off");
  await form.getByLabel(/Bemærkning/).fill("Bryllup");
  await form.getByRole("button", { name: "Tilføj" }).click();
  await expect(page.getByTestId("my-availability")).toContainText("Ønsker fri");
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  await expect(cell(page, MADS, day)).toContainText("Ønsker fri");
});
