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
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const MADS = "Mads Medarbejder";

test("admin copies an agreement, raises the evening supplement, sees it in the simulator and publishes", async ({
  page,
}) => {
  const tuesday = plus(mondayIn(26), 1);

  // An evening shift for Mads to simulate: 14–22 without a break gives 4 evening hours.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${mondayIn(26)}`);
  const c = cell(page, MADS, tuesday);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("14:00");
  await shift.getByLabel("Slut").fill("22:00");
  await shift.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.context().clearCookies();

  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  await page.getByRole("link", { name: "EKSEMPEL – Detail (fiktiv)", exact: true }).click();
  await expect(page.getByText("Systemskabeloner kan ikke ændres.")).toBeVisible();
  await page.getByRole("button", { name: "Lav egen kopi" }).click();
  await expect(page.getByText("Kopien er oprettet som kladde.")).toBeVisible();
  const editor = page.getByTestId("agreement-editor");
  await expect(editor).toBeVisible();

  // 30 kr. → 40 kr. an evening hour.
  await editor.locator('details[data-rule="aftentillaeg"] > summary').click();
  await editor
    .locator('details[data-rule="aftentillaeg"]')
    .getByLabel("Kr. pr. time")
    .fill("40,00");

  const sim = page.getByTestId("simulator");
  await sim.getByLabel("Medarbejder").selectOption({ label: MADS });
  await sim.getByLabel(/Uge/).fill(tuesday);
  await sim.getByRole("button", { name: "Simulér" }).click();
  // Earlier runs may have left more evening shifts that day: compare the rates, not a fixed sum.
  await expect(sim.getByTestId("sim-diff")).toContainText("AFTEN +");
  const aften = async (side: "before" | "after") => {
    const text = await sim
      .getByTestId(`sim-${side}`)
      .locator("tr", { hasText: "AFTEN" })
      .innerText();
    return Number(text.split("\t").at(-1)!.replace(/\./g, "").replace(",", "."));
  };
  const before = await aften("before");
  const after = await aften("after");
  expect(before).toBeGreaterThan(0);
  // 30 kr. → 40 kr. an evening hour.
  expect(after * 3).toBeCloseTo(before * 4, 2);

  await editor.getByRole("button", { name: "Validér" }).click();
  await expect(page.getByTestId("agreement-check")).toContainText("Dokumentet er gyldigt.");
  // The raise is deliberate: also confirm if saved test weeks (copied along) now fail.
  page.on("dialog", (d) => void d.accept());
  await editor.getByRole("button", { name: "Publicér" }).click();
  await expect(page.getByText("Versionen er publiceret.")).toBeVisible();
  await expect(page.getByTestId("agreement-versions")).toContainText("Publiceret");
  await expect(page.getByTestId("agreement-editor")).toHaveCount(0);
});

test("admin saves a hand-calculated test week, which follows a copy and catches a changed supplement", async ({
  page,
}) => {
  const name = `Aftenvagt ${Date.now()}`;
  const monday = mondayIn(30);
  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  await page.getByRole("link", { name: "EKSEMPEL – Detail (fiktiv)", exact: true }).click();

  const weeks = page.getByTestId("test-weeks");
  await weeks.getByRole("button", { name: "Ny testuge" }).click();
  const form = weeks.getByTestId("test-week-form");
  await form.getByLabel("Navn").fill(name);
  await form.getByLabel("Uge (mandag)").fill(monday);
  const shift = form.getByTestId("tw-shift");
  await shift.getByLabel("Dato 1").fill(plus(monday, 1));
  await shift.getByLabel("Start 1").fill("14:00");
  await shift.getByLabel("Slut 1").fill("22:00");
  await shift.getByLabel("Ubetalt pause (min) 1").fill("0");
  // By hand: 8 h × 150 kr. and 18–22 = 4 h × 30 kr.
  await form.getByLabel("Lønart 1").fill("NORMAL");
  await form.getByLabel("Timer 1").fill("8");
  await form.getByLabel("Beløb (kr.) 1").fill("1.200,00");
  await form.getByRole("button", { name: "Tilføj lønart" }).click();
  await form.getByLabel("Lønart 2").fill("AFTEN");
  await form.getByLabel("Timer 2").fill("4");
  await form.getByLabel("Beløb (kr.) 2").fill("120");
  // 8 hours without a break must be flagged.
  await form.getByLabel(/Forventede regelbrud/).fill("break_missing");
  await form.getByRole("button", { name: "Nuværende beregning (kun til hjælp)" }).click();
  await expect(form.getByTestId("tw-current")).toContainText("AFTEN 4,00 t / 120,00 kr.");
  await form.getByRole("button", { name: "Gem testuge" }).click();
  await expect(page.getByText("Testugen er gemt.")).toBeVisible();
  const item = weeks.locator(`[data-test-week="${name}"]`);
  await expect(item).toContainText("Publiceret version: Bestået");

  // The copy brings the test week; 30 kr. → 40 kr. an evening hour makes it fail against the draft.
  await page.getByRole("button", { name: "Lav egen kopi" }).click();
  await expect(page.getByText("Kopien er oprettet som kladde.")).toBeVisible();
  const editor = page.getByTestId("agreement-editor");
  await expect(item).toContainText("Kladden: Bestået");
  await editor.locator('details[data-rule="aftentillaeg"] > summary').click();
  await editor
    .locator('details[data-rule="aftentillaeg"]')
    .getByLabel("Kr. pr. time")
    .fill("40,00");
  await editor.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();
  await weeks.getByRole("button", { name: "Kør testuger" }).click();
  await expect(item).toContainText("Kladden: Fejler");
  await expect(item.getByTestId("test-diff")).toContainText(
    "AFTEN: forventet 4,00 t / 120,00 kr., beregnet 4,00 t / 160,00 kr.",
  );

  // Publishing warns about the failing test week; declining keeps the draft.
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void (dialogs.length === 1 ? d.accept() : d.dismiss());
  });
  await editor.getByRole("button", { name: "Publicér" }).click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toContain("testuge");
  await expect(page.getByTestId("agreement-versions")).toContainText("Kladde");
  await expect(editor).toBeVisible();
});
