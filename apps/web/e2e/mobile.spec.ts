import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("employee can navigate on a phone", async ({ page }) => {
  await login(page, users.young);
  const bar = page.getByRole("navigation", { name: "Hovedmenu" }).last();
  await bar.getByRole("link", { name: "Min profil" }).click();
  await expect(page.getByRole("heading", { name: "Ida Ung" })).toBeVisible();
  await expect(page.getByText(/Ung under 18/)).toBeVisible();
});
