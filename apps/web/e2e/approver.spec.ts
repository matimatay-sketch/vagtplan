import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
};

test("a personal approver approves one employee's time without a time permission", async ({
  page,
}) => {
  const nav = () => page.getByRole("navigation", { name: "Hovedmenu" });

  // The admin makes Mads the approver of Ida.
  await login(page, users.admin);
  await page.goto("/medarbejdere");
  await page
    .getByRole("link", { name: /Ida Ung/ })
    .first()
    .click();
  const approver = page.getByTestId("approver-form");
  await approver
    .getByLabel("Godkendes af")
    .selectOption({ label: "Mads Medarbejder (medarbejder@demo.dk)" });
  await approver.getByRole("button", { name: "Gem godkender" }).click();
  await expect(approver.getByText("Gemt")).toBeVisible();
  await page.context().clearCookies();

  // Ida registers time yesterday without a shift.
  await login(page, users.young);
  await page.goto("/tid");
  await page.getByRole("button", { name: "Registrér tid" }).click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Dato").fill(yesterday());
  await form.getByLabel("Start").fill("15:00");
  await form.getByLabel("Slut").fill("18:00");
  await form.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await form.getByLabel("Begrundelse for afvigelse").fill("Ekstra vagt efter aftale");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await page.context().clearCookies();

  // Mads (profile Medarbejder) sees only Ida's time and approves it.
  await login(page, users.employee);
  await nav().getByRole("link", { name: "Godkend tid" }).click();
  await expect(page).toHaveURL(/\/tid\/godkend/);
  // Yesterday may be in last week (on a Monday).
  await page.goto(`/tid/godkend?uge=${yesterday()}`);
  await expect(page.locator("section[data-employee]")).toHaveCount(1);
  const ida = page.locator('section[data-employee="Ida Ung"]');
  const row = ida.getByTestId("approval-row").filter({ hasText: "15:00–18:00" });
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByText("1 registrering godkendt.")).toBeVisible();
  await expect(row).toContainText("Godkendt");
  await page.context().clearCookies();

  // Reset for other tests.
  await login(page, users.admin);
  await page.goto("/medarbejdere");
  await page
    .getByRole("link", { name: /Ida Ung/ })
    .first()
    .click();
  await page.getByTestId("approver-form").getByLabel("Godkendes af").selectOption("");
  await page.getByTestId("approver-form").getByRole("button", { name: "Gem godkender" }).click();
  await expect(page.getByTestId("approver-form").getByText("Gemt")).toBeVisible();
});
