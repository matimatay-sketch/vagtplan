import { expect, test } from "@playwright/test";
import { latestLinkFor, login, users } from "./helpers";

test("manager invites an employee who can then sign in via the link", async ({ page, browser }) => {
  await login(page, users.manager);
  const email = `inviteret-${Date.now()}@test.dk`;
  await page.goto("/medarbejdere/ny");
  await page.getByLabel("Fornavn").fill("Inge");
  await page.getByLabel("Efternavn").fill("Inviteret");
  await page.getByLabel("Medarbejdernr.").fill(Date.now().toString().slice(-7));
  await page.getByLabel("Fødselsdato").fill("1995-06-01");
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByRole("heading", { name: /Inge Inviteret/ })).toBeVisible();

  // Without users.manage the default profile is used (no profile picker).
  await expect(page.getByLabel("Rettighedsprofil")).toHaveCount(0);
  await page.getByRole("button", { name: "Invitér til login" }).click();
  await expect(page.getByText("Har login")).toBeVisible();

  const link = await latestLinkFor(email);
  const ctx = await browser.newContext({ locale: "da-DK" });
  const invited = await ctx.newPage();
  await invited.goto(link);
  await expect(invited).toHaveURL(/\/oversigt/);
  await expect(invited.getByText("Hej Inge")).toBeVisible();
  await expect(invited.getByText("Medarbejder").first()).toBeVisible();
  await ctx.close();
});
