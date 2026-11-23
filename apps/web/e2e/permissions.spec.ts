import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const MADS = "/medarbejdere/50000000-0000-0000-0000-000000000002";
const ANNE = "/medarbejdere/50000000-0000-0000-0000-000000000005";

async function setLederContracts(page: Page, scope: "Ingen" | "Afdelinger, man er ansvarlig for") {
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
  await setLederContracts(page, "Afdelinger, man er ansvarlig for");
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

  await page.goto(MADS);
  await page.getByTestId("member-profile-form").getByRole("combobox").selectOption({ label: name });
  await page
    .getByTestId("member-profile-form")
    .getByRole("button", { name: "Skift profil" })
    .click();
  await page.reload();
  await expect(
    page.getByTestId("member-profile-form").getByRole("combobox").locator("option:checked"),
  ).toHaveText(name);
  await page.context().clearCookies();

  // The employee now sees all employees, including Café.
  await login(page, users.employee);
  await page.goto("/medarbejdere");
  await expect(page.getByRole("link", { name: "Carl Café" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny medarbejder" })).toHaveCount(0);
  await page.context().clearCookies();

  // Restore.
  await login(page, users.admin);
  await page.goto(MADS);
  await page
    .getByTestId("member-profile-form")
    .getByRole("combobox")
    .selectOption({ label: "Medarbejder" });
  await page
    .getByTestId("member-profile-form")
    .getByRole("button", { name: "Skift profil" })
    .click();
  await page.reload();
  await expect(
    page.getByTestId("member-profile-form").getByRole("combobox").locator("option:checked"),
  ).toHaveText("Medarbejder");
});

test("the last administrator cannot be demoted", async ({ page }) => {
  await login(page, users.admin);
  await page.goto(ANNE);
  await page
    .getByTestId("member-profile-form")
    .getByRole("combobox")
    .selectOption({ label: "Medarbejder" });
  await page
    .getByTestId("member-profile-form")
    .getByRole("button", { name: "Skift profil" })
    .click();
  await expect(page.getByText("Der skal altid være mindst én administrator.")).toBeVisible();
});

test("admin makes an employee responsible for a department on the employee page", async ({
  page,
}) => {
  await login(page, users.admin);
  await page.goto(MADS);
  const box = page.getByTestId("responsible-departments");
  await box.getByLabel("Gør ansvarlig for afdeling").selectOption({ label: "Café" });
  await box.getByRole("button", { name: "Gør ansvarlig" }).click();
  await expect(box.getByText("Café")).toBeVisible();
  await box.getByRole("button", { name: "Fjern Café" }).click();
  await expect(box.getByText("Ingen")).toBeVisible();
});

test("profiles can be compared side by side, also only the differences", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/indstillinger/rettigheder");
  await page.getByTestId("compare-profiles").click();
  await expect(page).toHaveURL(/\/indstillinger\/rettigheder\/sammenlign/);

  const table = page.getByTestId("compare-table");
  const header = table.locator("thead");
  await expect(header).toContainText("Administrator");
  await expect(header).toContainText("Leder");
  await expect(page.getByTestId("compare-summary")).toContainText("forskellige på");

  // Administrator has every permission for the whole company; Leder only for own departments.
  const row = table.locator('[data-permission="employees.manage"]');
  await expect(row).toHaveAttribute("data-differs", "true");
  await expect(row).toContainText("Hele virksomheden");
  await expect(row).toContainText("Afdelinger, man er ansvarlig for");

  // Only the differences: every row shown differs.
  const all = await table.getByTestId("compare-row").count();
  await page.getByLabel("Vis kun forskelle").check();
  await expect(page).toHaveURL(/forskelle=1/);
  await expect.poll(async () => table.getByTestId("compare-row").count()).toBeLessThanOrEqual(all);
  await expect(table.locator('[data-testid="compare-row"]:not([data-differs])')).toHaveCount(0);

  // Two profiles only: the columns follow the choice.
  const controls = page.getByTestId("compare-controls");
  const names = await controls.locator("fieldset label").allTextContents();
  for (const name of names)
    if (name !== "Administrator" && name !== "Leder") await controls.getByLabel(name).uncheck();
  await expect(header.locator("th")).toHaveCount(3);
  await controls.getByLabel("Leder").uncheck();
  await expect(page.getByTestId("compare-summary")).toHaveText(
    "Vælg mindst to profiler for at se forskellene.",
  );
});
