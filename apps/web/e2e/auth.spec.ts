import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/medarbejdere");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Log ind" })).toBeVisible();
});

test("wrong password shows a Danish error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(users.admin);
  await page.getByLabel("Adgangskode").fill("forkert-kode");
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page.getByText("Forkert e-mail eller adgangskode.")).toBeVisible();
});

test("navigation depends on role", async ({ page }) => {
  const nav = () => page.getByRole("navigation", { name: "Hovedmenu" });

  await login(page, users.admin);
  await expect(nav().getByRole("link", { name: "Overenskomster" })).toBeVisible();
  await expect(nav().getByRole("link", { name: "Medarbejdere" })).toBeVisible();
  await page.getByTestId("user-menu").filter({ visible: true }).click();
  await page.getByRole("menuitem", { name: "Log ud" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, users.manager);
  await expect(nav().getByRole("link", { name: "Medarbejdere" })).toBeVisible();
  await expect(nav().getByRole("link", { name: "Overenskomster" })).toHaveCount(0);
  await page.goto("/indstillinger/overenskomster");
  await expect(page).toHaveURL(/adgang=nej/);
  await expect(page.getByText("Du har ikke adgang til dette.")).toBeVisible();
  await page.context().clearCookies();

  await login(page, users.employee);
  await expect(nav().getByRole("link", { name: "Min profil" })).toBeVisible();
  await expect(nav().getByRole("link", { name: "Medarbejdere" })).toHaveCount(0);
  await page.goto("/medarbejdere");
  await expect(page).toHaveURL(/adgang=nej/);
});

test("sign up creates an organization with the user as admin", async ({ page }) => {
  const email = `ny-${Date.now()}@test.dk`;
  await page.goto("/opret");
  await page.getByLabel("Virksomhedens navn").fill("Testbageriet ApS");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill("Hemmelig123");
  await page.getByRole("button", { name: "Opret konto" }).click();
  await expect(page).toHaveURL(/\/oversigt/);
  await expect(page.getByTestId("org-name")).toHaveText("Testbageriet ApS");
  await expect(page.getByText("Administrator").first()).toBeVisible();
  // Isolation: the new organization sees none of the demo employees.
  await page.goto("/medarbejdere");
  await expect(page.getByText("Ingen medarbejdere endnu.")).toBeVisible();
});
