import { expect, test } from "@playwright/test";
import { login, unique, users } from "./helpers";

test("admin creates a department, an employee and a contract", async ({ page }) => {
  await login(page, users.admin);

  // Department
  const deptName = unique("Lager");
  await page.goto("/afdelinger");
  await page.getByLabel("Ny afdeling").fill(deptName);
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByTestId(`department-${deptName}`)).toBeVisible();

  // Duplicate name is rejected in Danish
  await page.getByLabel("Ny afdeling").fill(deptName);
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByText("Der findes allerede en afdeling med det navn.")).toBeVisible();

  // Employee – validation first
  await page.goto("/medarbejdere/ny");
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByText("Skal udfyldes").first()).toBeVisible();

  const number = Date.now().toString().slice(-6);
  await page.getByLabel("Fornavn").fill("Emil");
  await page.getByLabel("Efternavn").fill("Elev");
  await page.getByLabel("Medarbejdernr.").fill(number);
  await page.getByLabel("Fødselsdato").fill("2011-03-15");
  await page.getByLabel("Afdeling").selectOption({ label: deptName });
  await page.getByLabel("Undervisningspligtig").check();
  await page.getByRole("button", { name: "Opret" }).click();

  await expect(page.getByRole("heading", { name: /Emil Elev/ })).toBeVisible();
  await expect(page.getByText("Ung under 18").first()).toBeVisible();

  // Contract
  await page.getByLabel("Timer pr. uge").fill("8,5");
  await page.getByLabel("Lønform").selectOption("hourly");
  await page.getByLabel("Lønperiode-gruppe").selectOption({ label: "Timelønnede (14 dage)" });
  await page.getByLabel("Gyldig fra").fill("2026-12-01");
  await page.getByRole("button", { name: "Ny kontrakt" }).click();
  const contract = page.getByTestId("contract");
  await expect(contract).toHaveCount(1);
  await expect(contract).toContainText("8,5 t/uge");
  await expect(contract).toContainText("Fremtidig");

  // Overlap is rejected with a clear message
  await page.getByText("Ny kontrakt").first().click();
  await page.getByLabel("Gyldig fra").fill("2027-01-01");
  await page.getByRole("button", { name: "Ny kontrakt" }).click();
  await expect(page.getByText(/overlapper en eksisterende kontrakt/)).toBeVisible();
});

test("pay period groups show example periods", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/indstillinger/lonperioder");
  const name = unique("Ugeløn");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Frekvens").selectOption("weekly");
  await page.getByLabel("Første periode starter").fill("2026-01-06");
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByText("Datoen skal være en mandag.")).toBeVisible();
  await page.getByLabel("Første periode starter").fill("2026-01-05");
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
