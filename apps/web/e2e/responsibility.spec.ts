import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("a manager who is not responsible for any department is told why they see no one, and the administrator fixes it", async ({
  page,
}) => {
  // The administrator removes Lise's responsibility for Butik (as if it was never set up).
  await login(page, users.admin);
  await page.goto("/medarbejdere");
  await page
    .getByRole("link", { name: /Lise Leder/ })
    .first()
    .click();
  const responsible = page.getByTestId("responsible-departments");
  await responsible.getByRole("button", { name: /Butik/ }).click();
  await expect(responsible.getByTestId("no-responsibility-warning")).toBeVisible();
  await expect(responsible.getByTestId("no-responsibility-warning")).toContainText(
    "Lise har rettigheder til de afdelinger, brugeren er ansvarlig for",
  );
  const employeeUrl = page.url();
  await page.context().clearCookies();

  // Lise is told why she sees no employees.
  await login(page, users.manager);
  await expect(page.getByTestId("no-responsibility")).toBeVisible();
  await page.context().clearCookies();

  // One click makes her responsible for her own departments again.
  await login(page, users.admin);
  await page.goto(employeeUrl);
  await page
    .getByTestId("no-responsibility-warning")
    .getByRole("button", { name: "Gør ansvarlig for Butik" })
    .click();
  await expect(page.getByTestId("no-responsibility-warning")).toHaveCount(0);
  await expect(page.getByTestId("responsible-departments")).toContainText("Butik");
  await page.context().clearCookies();

  await login(page, users.manager);
  await expect(page.getByTestId("no-responsibility")).toHaveCount(0);
  await page.goto("/medarbejdere");
  await expect(page.getByRole("link", { name: /Mads Medarbejder/ }).first()).toBeVisible();
});
