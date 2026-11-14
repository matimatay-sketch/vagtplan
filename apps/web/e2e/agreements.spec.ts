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
  await editor.locator('[id="aftentillaeg.amount.ore"]').fill("4000");

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
  page.once("dialog", (d) => d.accept());
  await editor.getByRole("button", { name: "Publicér" }).click();
  await expect(page.getByText("Versionen er publiceret.")).toBeVisible();
  await expect(page.getByTestId("agreement-versions")).toContainText("Publiceret");
  await expect(page.getByTestId("agreement-editor")).toHaveCount(0);
});
