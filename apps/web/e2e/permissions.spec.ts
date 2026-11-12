import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

async function setLederContracts(page: Page, scope: "Ingen" | "Egne afdelinger") {
  await page.goto("/indstillinger/rettigheder");
  await page.getByRole("link", { name: /^Leder/ }).click();
  const matrix = page.getByTestId("grant-matrix");
  await matrix
    .getByRole("radiogroup", { name: "Opret og afslut kontrakter" })
    .getByText(scope)
    .click();
  await matrix.getByRole("button", { name: "Gem rettigheder" }).click();
  await expect(matrix.getByText("Gemt")).toBeVisible();
}

test("admin can restrict the Leder profile and the manager loses the ability", async ({ page }) => {
  await login(page, users.admin);
  await setLederContracts(page, "Ingen");

  // The locked owner profile cannot be edited.
  await page.getByRole("link", { name: /^Administrator/ }).click();
  await expect(page.getByText("Administrator-profilen har altid alle rettigheder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gem rettigheder" })).toHaveCount(0);
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto("/medarbejdere/50000000-0000-0000-0000-000000000002");
  await expect(page.getByTestId("contract")).toHaveCount(1); // still visible (contracts.view)
  await expect(page.getByText("Ny kontrakt")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Afslut kontrakt" })).toHaveCount(0);
  await page.context().clearCookies();

  // Restore for other tests.
  await login(page, users.admin);
  await setLederContracts(page, "Egne afdelinger");
});

test("admin creates a custom profile and assigns it to a user", async ({ page }) => {
  await login(page, users.admin);
  const name = `Planlægger ${Date.now().toString(36)}`;
  await page.goto("/indstillinger/rettigheder");
  await page.getByLabel("Ny profil").fill(name);
  await page.getByRole("button", { name: "Opret" }).click();
  await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
  const matrix = page.getByTestId("grant-matrix");
  await matrix
    .getByRole("radiogroup", { name: "Se medarbejdere" })
    .getByText("Hele virksomheden")
    .click();
  await matrix.getByRole("button", { name: "Gem rettigheder" }).click();
  await expect(matrix.getByText("Gemt")).toBeVisible();

  await page.goto("/indstillinger/brugere");
  const row = page.getByTestId("member-medarbejder@demo.dk");
  await row.getByRole("combobox").selectOption({ label: name });
  await row.getByRole("button", { name: "Gem" }).click();
  await page.reload();
  await expect(page.getByTestId("member-medarbejder@demo.dk").locator("option:checked")).toHaveText(
    name,
  );
  await page.context().clearCookies();

  // The employee now sees all employees, including Café.
  await login(page, users.employee);
  await page.goto("/medarbejdere");
  await expect(page.getByRole("link", { name: "Carl Café" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny medarbejder" })).toHaveCount(0);
  await page.context().clearCookies();

  // Restore.
  await login(page, users.admin);
  await page.goto("/indstillinger/brugere");
  const restored = page.getByTestId("member-medarbejder@demo.dk");
  await restored.getByRole("combobox").selectOption({ label: "Medarbejder" });
  await restored.getByRole("button", { name: "Gem" }).click();
  await expect(restored.getByRole("button", { name: "Gem" })).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId("member-medarbejder@demo.dk").locator("option:checked")).toHaveText(
    "Medarbejder",
  );
});

test("the last administrator cannot be demoted", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/indstillinger/brugere");
  const row = page.getByTestId("member-admin@demo.dk");
  await row.getByRole("combobox").selectOption({ label: "Medarbejder" });
  await row.getByRole("button", { name: "Gem" }).click();
  await expect(row.getByText("Der skal altid være mindst én administrator.")).toBeVisible();
});
