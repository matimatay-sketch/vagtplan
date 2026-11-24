import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("guides: read on the page and downloaded as PDF; each user sees the guides for their rights", async ({
  page,
  request,
}) => {
  await login(page, users.employee);
  await page.getByRole("link", { name: "Vejledninger" }).first().click();
  await expect(page).toHaveURL(/\/vejledninger$/);
  await expect(page.getByTestId("guides").locator("li")).toHaveCount(1);
  await page.getByRole("link", { name: "Læs vejledningen" }).click();
  const guide = page.getByTestId("guide");
  await expect(guide.getByRole("heading", { level: 1 })).toHaveText("Turnus for medarbejdere");
  await guide.getByRole("link", { name: "Stempl ind og ud" }).click();
  await expect(page).toHaveURL(/#stempling$/);
  await expect(guide.getByRole("img", { name: /årsagen til at stemple ind/ })).toBeVisible();

  const download = page.waitForEvent("download");
  await guide.getByRole("link", { name: "Hent som PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("turnus-vejledning-medarbejder.pdf");
  // An employee cannot open the managers' guide.
  expect((await page.request.get("/vejledninger/leder/pdf")).status()).toBe(404);
  await page.goto("/vejledninger/leder");
  await expect(page.getByText(/kunne ikke findes|404/i).first()).toBeVisible();
  await page.context().clearCookies();

  await login(page, users.admin);
  await page.goto("/vejledninger");
  await expect(page.getByTestId("guides").locator("li")).toHaveCount(3);
  const pdf = await page.request.get("/vejledninger/administrator/pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // Not logged in: no guide.
  expect(
    (await request.get("/vejledninger/medarbejder/pdf", { maxRedirects: 0 })).status(),
  ).not.toBe(200);
});
