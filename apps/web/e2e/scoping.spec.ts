import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("manager only sees employees in their own department", async ({ page }) => {
  await login(page, users.manager);
  await page.goto("/medarbejdere");
  await expect(page.getByRole("link", { name: "Mads Medarbejder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ida Ung" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Carl Café" })).toHaveCount(0);

  // Direct URL to an employee outside the department gives 404.
  const res = await page.goto("/medarbejdere/50000000-0000-0000-0000-000000000004");
  expect(res?.status()).toBe(404);
});

test("manager can create an employee only in a managed department", async ({ page }) => {
  await login(page, users.manager);
  await page.goto("/medarbejdere/ny");
  const options = await page.getByLabel("Afdeling").locator("option").allTextContents();
  expect(options).toContain("Butik");
  expect(options).not.toContain("Café");
});

test("employee sees only their own profile and contract", async ({ page }) => {
  await login(page, users.employee);
  await page.goto("/profil");
  await expect(page.getByRole("heading", { name: "Mads Medarbejder" })).toBeVisible();
  await expect(page.getByText("EKSEMPEL – Detail (fiktiv)").first()).toBeVisible();
});
