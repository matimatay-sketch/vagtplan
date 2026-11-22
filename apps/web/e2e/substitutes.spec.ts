import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("the approval page shows an exact date range", async ({ page }) => {
  await login(page, users.manager);
  await page.goto("/tid/godkend");
  const range = page.getByTestId("date-range");
  await range.getByLabel("Fra").fill("2026-11-02");
  await range.getByLabel("Til").fill("2026-11-04");
  await range.getByRole("button", { name: "Vis perioden" }).click();
  await expect(page).toHaveURL(/fra=2026-11-02&til=2026-11-04/);
  await expect(page.getByTestId("week-label")).toContainText("–");
  // The arrows move by the range's own length (three days).
  await page.getByRole("link", { name: "Næste periode" }).click();
  await expect(page).toHaveURL(/fra=2026-11-05&til=2026-11-07/);
  await page.getByRole("link", { name: "Denne uge" }).click();
  await expect(page.getByTestId("week-label")).toContainText("Uge");
});

test("a manager appoints a substitute approver for a period and ends it early", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  const banner = page.getByTestId("substitute-banner");

  // Lise (manager of Butik) goes on holiday: Mads approves meanwhile.
  await login(page, users.manager);
  await page.goto("/tid/godkend");
  await page.getByRole("link", { name: "Stedfortrædere" }).click();
  await expect(page).toHaveURL(/\/tid\/godkend\/stedfortraedere/);
  const form = page.getByTestId("substitute-form").first();
  await form.getByLabel("Stedfortræder").selectOption({ label: "Mads Medarbejder" });
  await form.getByLabel("Note (valgfri)").fill("Ferie");
  await form.getByRole("button", { name: "Opret stedfortræder" }).click();
  await expect(page.getByText("Stedfortræderen er oprettet.")).toBeVisible();
  const row = page
    .getByTestId("substitutes")
    .locator("li")
    .filter({ hasText: "Lise Leder → Mads Medarbejder" })
    .filter({ hasText: "Aktiv" });
  await expect(row).toHaveCount(1);
  await page.context().clearCookies();

  // Mads, an employee without approval rights, now approves Butik's time.
  await login(page, users.employee);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Godkend tid" })
    .click();
  await expect(banner).toContainText("Du er stedfortræder for Lise Leder");
  await page.context().clearCookies();

  // Lise is back early and ends it.
  await login(page, users.manager);
  await page.goto("/tid/godkend/stedfortraedere");
  await row.getByRole("button", { name: "Afslut nu" }).click();
  await expect(page.getByText("Stedfortrædelsen er afsluttet.")).toBeVisible();
  await expect(
    page
      .getByTestId("substitutes")
      .locator("li")
      .filter({ hasText: "Lise Leder → Mads Medarbejder" })
      .first(),
  ).toContainText("Afsluttet");
  await page.context().clearCookies();

  await login(page, users.employee);
  await page.goto("/tid/godkend");
  await expect(banner).toHaveCount(0);
});
