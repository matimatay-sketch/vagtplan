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

test("help explanations open with a tap on a phone", async ({ page }) => {
  await login(page, users.employee);
  await page.goto("/fravaer");
  await page.getByTestId("help-toggle").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Forklaring: Fravær og ferie" }).tap();
  await expect(page.getByTestId("help-content")).toContainText("Søg om ferie og fri");
});

test("no page is wider than the phone, so the bottom menu stays in view", async ({ page }) => {
  test.setTimeout(120_000);
  const pages: [string, string[]][] = [
    [
      users.manager,
      [
        "/oversigt",
        "/vagtplan",
        "/tid/godkend",
        "/fravaer/godkend",
        "/beskeder",
        "/medarbejdere",
        "/profil",
      ],
    ],
    [users.employee, ["/oversigt", "/min-vagtplan", "/tid", "/fravaer", "/koersel", "/profil"]],
  ];
  for (const [user, paths] of pages) {
    await page.context().clearCookies();
    await login(page, user);
    for (const path of paths) {
      await page.goto(path);
      const size = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        screen: window.innerWidth,
      }));
      expect(size.page, `${path} is wider than the phone`).toBeLessThanOrEqual(size.screen);
      await expect(page.getByRole("navigation", { name: "Hovedmenu" }).last()).toBeInViewport();
    }
  }
});
