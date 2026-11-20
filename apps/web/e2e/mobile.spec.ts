import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("employee can navigate on a phone", async ({ page }) => {
  await login(page, users.young);
  const bar = page.getByRole("navigation", { name: "Hovedmenu" }).last();
  // At most five targets in the bar; the rest is under "Mere".
  await expect(bar.locator(":scope > *")).toHaveCount(5);
  await bar.getByRole("button", { name: "Mere" }).click();
  await page.getByTestId("nav-more").getByRole("link", { name: "Min profil" }).click();
  await expect(page.getByRole("heading", { name: "Ida Ung" })).toBeVisible();
  await expect(page.getByText(/Ung under 18/)).toBeVisible();
});

test("the schedule opens in the day view on a phone, with a visible + per cell", async ({
  page,
}) => {
  await login(page, users.manager);
  await page.goto("/vagtplan");
  await expect(page.getByTestId("day-board")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Dag" })).toHaveAttribute("aria-selected", "true");
  await page.goto("/vagtplan?visning=uge");
  const add = page.getByTestId("week-board").getByRole("button", { name: "Ny vagt" }).first();
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("approval filters fold away on a phone", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/tid/godkend");
  const flags = page.getByTestId("flag-filters");
  await expect(flags.getByText("Afviger fra plan")).toBeHidden();
  await flags.getByText("Flere filtre").click();
  await expect(flags.getByText("Afviger fra plan")).toBeVisible();
});
