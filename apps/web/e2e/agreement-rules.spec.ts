import { expect, test, type Locator, type Page } from "@playwright/test";
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

type Line = [code: string, hours: string, amount: string];

/** A test week: Tuesday 14–22 without a break, for a staff group, with hand-calculated lines. */
async function addTestWeek(page: Page, name: string, staffGroup: string, lines: Line[]) {
  const weeks = page.getByTestId("test-weeks");
  await weeks.getByRole("button", { name: "Ny testuge" }).click();
  const form = weeks.getByTestId("test-week-form");
  const monday = mondayIn(30);
  await form.getByLabel("Navn").fill(name);
  await form.getByLabel("Uge (mandag)").fill(monday);
  await form.getByLabel("Personalegruppe").fill(staffGroup);
  const shift = form.getByTestId("tw-shift");
  await shift.getByLabel("Dato 1").fill(plus(monday, 1));
  await shift.getByLabel("Start 1").fill("14:00");
  await shift.getByLabel("Slut 1").fill("22:00");
  await shift.getByLabel("Ubetalt pause (min) 1").fill("0");
  for (const [i, [code, hours, amount]] of lines.entries()) {
    if (i > 0) await form.getByRole("button", { name: "Tilføj lønart" }).click();
    await form.getByLabel(`Lønart ${i + 1}`, { exact: true }).fill(code);
    await form.getByLabel(`Timer ${i + 1}`).fill(hours);
    await form.getByLabel(`Beløb (kr.) ${i + 1}`).fill(amount);
  }
  await form.getByLabel(/Forventede regelbrud/).fill("BREAK_MISSING");
  await form.getByRole("button", { name: "Gem testuge" }).click();
  await expect(form).toHaveCount(0);
  return weeks.locator(`[data-test-week="${name}"]`);
}

const rule = (page: Page, id: string): Locator => page.locator(`details[data-rule="${id}"]`);

test("consultant adds an evening supplement and a higher rate only for one staff group", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  await page.getByRole("link", { name: "EKSEMPEL – Detail (fiktiv)", exact: true }).click();
  await expect(page.getByText("Systemskabeloner kan ikke ændres.")).toBeVisible();
  await page.getByRole("button", { name: "Lav egen kopi" }).click();
  await expect(page.getByText("Kopien er oprettet som kladde.")).toBeVisible();
  const editor = page.getByTestId("agreement-editor");
  await expect(editor).toBeVisible();

  // A new supplement: 25 kr. an hour on weekdays 18–24, for Lager only.
  const add = page.getByTestId("add-rule");
  await add.getByLabel("Navn på reglen").fill("Aftentillæg lager");
  await add.getByLabel("Type").selectOption("time_window_supplement");
  await add.getByRole("button", { name: "Tilføj", exact: true }).click();
  const lager = rule(page, "aftentillaeg-lager");
  await expect(lager.getByTestId("supplement-fields")).toBeVisible();
  await expect(lager.getByLabel("Lønart")).toHaveValue("AFTENTILLAEG_LAGER");
  await lager.getByLabel("Kr. pr. time").fill("25,00");
  await expect(lager.getByRole("button", { name: "Hverdage" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await lager.getByLabel("Fra", { exact: true }).fill("18:00");
  await lager.getByLabel("Til", { exact: true }).fill("24:00");
  await lager.getByLabel("Tilføj personalegruppe").fill("Lager");
  await lager.getByRole("button", { name: "Tilføj personalegruppe" }).click();
  await expect(lager.getByTestId("rule-applies-to")).toHaveText("Gælder for: Lager");
  await lager.getByLabel("Kilde").fill("Lokal aftale § 3");

  // The base rate: a more specific row for Lager wins over the general one.
  const rate = rule(page, "loensats");
  await rate.locator("summary").click();
  // The template has two rows (adults, under 18); the new row is the third.
  await expect(rate.getByTestId("rate-row")).toHaveCount(2);
  await rate.getByRole("button", { name: "Tilføj sats" }).click();
  await rate.getByLabel("Personalegruppe 3").fill("Lager");
  await rate.getByLabel("Timeløn (kr.) 3").fill("160,00");

  // The new pay code is listed with the rule's name as its label.
  await expect(
    page.getByTestId("pay-codes").locator('tr[data-pay-code="AFTENTILLAEG_LAGER"] input'),
  ).toHaveValue("Aftentillæg lager");

  await editor.getByRole("button", { name: "Validér" }).click();
  await expect(page.getByTestId("agreement-check")).toContainText("Dokumentet er gyldigt.");
  await editor.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();

  // Hand-calculated: Lager 8 h × 160 kr., evening 4 h × 30 kr. and 4 h × 25 kr.
  const lagerWeek = await addTestWeek(page, `Lager aften ${Date.now()}`, "Lager", [
    ["NORMAL", "8", "1.280,00"],
    ["AFTEN", "4", "120,00"],
    ["AFTENTILLAEG_LAGER", "4", "100,00"],
  ]);
  await expect(lagerWeek).toContainText("Kladden: Bestået");
  // Butik: the general rate and no Lager supplement.
  const butikWeek = await addTestWeek(page, `Butik aften ${Date.now()}`, "Butik", [
    ["NORMAL", "8", "1.200,00"],
    ["AFTEN", "4", "120,00"],
  ]);
  await expect(butikWeek).toContainText("Kladden: Bestået");
});
