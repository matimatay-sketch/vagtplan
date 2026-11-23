import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

// A week far ahead, so the shift does not meet other tests' shifts.
function mondayIn(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);

test("the administrator adds an own rule that applies on top of every agreement", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  const week = mondayIn(40);
  const name = `Vagt over 12 timer ${Date.now().toString().slice(-5)}`;

  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const rules = page.getByTestId("custom-rules");
  await rules.getByLabel("Navn på ny regel").fill(name);
  await rules.getByLabel("Kontrollér").selectOption({ label: "Vagten er længere end" });
  await rules.getByRole("button", { name: "Tilføj regel" }).click();
  const rule = rules.locator("fieldset[data-custom-rule]").filter({ hasText: name });
  await rule.getByLabel("Timer", { exact: true }).fill("12");
  await rule.getByLabel("Alvor").selectOption({ label: "Info" });
  await rules.getByRole("button", { name: "Gem egne regler" }).click();
  await expect(page.getByText("Egne regler er gemt.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("custom-rules").locator("fieldset").filter({ hasText: name }),
  ).toHaveCount(1);

  // A 14-hour shift for Mads: the schedule shows the own rule.
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, "Mads Medarbejder", week);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("06:00");
  await shift.getByLabel("Slut").fill("20:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  // The icon's text lists every remark on the shift (its colour follows the most serious one).
  await expect(c.locator('[data-testid^="violation-"]').first()).toHaveAttribute(
    "title",
    new RegExp(`Info: ${name} \\(14 t`),
  );

  // Clean up: the shift and the rule.
  await c
    .getByRole("button", { name: /06:00–20:00/ })
    .first()
    .click();
  await page.getByTestId("shift-form").getByRole("button", { name: "Fjern vagt" }).click();
  await expect(page.getByTestId("shift-form")).toHaveCount(0);
  await page.goto("/indstillinger/opsaetning");
  await page
    .getByTestId("custom-rules")
    .getByRole("button", { name: `Fjern ${name}` })
    .click();
  await page.getByTestId("custom-rules").getByRole("button", { name: "Gem egne regler" }).click();
  await expect(page.getByText("Egne regler er gemt.")).toBeVisible();
});
