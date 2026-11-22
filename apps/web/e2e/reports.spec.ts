import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("reports: employee data, time, absence, planned shifts and norm, downloaded as CSV", async ({
  page,
}) => {
  // Five reports over a year of test data.
  test.setTimeout(90_000);
  await login(page, users.admin);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Rapporter" })
    .click();
  await expect(page).toHaveURL(/\/rapporter/);
  const table = page.getByTestId("report-table");
  // Employee data (the default report).
  await expect(table).toContainText("Mads Medarbejder");
  await expect(table.locator("thead")).toContainText("Overenskomst");

  const form = page.getByTestId("report-form");
  for (const [label, header] of [
    ["Registreret tid", "Arbejdstid (timer)"],
    ["Fravær", "Fraværstype"],
    ["Planlagte vagter", "Planlagt (timer)"],
    ["Normtid, planlagt og registreret", "Forskel (timer)"],
  ] as const) {
    await form.getByLabel("Rapport").selectOption({ label });
    await form.getByLabel("Fra").fill("2026-01-01");
    await form.getByLabel("Til").fill("2026-12-31");
    await form.getByRole("button", { name: "Vis rapport" }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
    // Either a table with the report's columns or "no data".
    await expect(table.or(page.getByText("Ingen data i perioden."))).toBeVisible();
    if (await table.isVisible()) await expect(table.locator("thead")).toContainText(header);
  }

  // The norm report as CSV for Butik.
  await form.getByLabel("Afdeling").selectOption({ label: "Butik" });
  await form.getByRole("button", { name: "Vis rapport" }).click();
  await expect(page).toHaveURL(/afdeling=/);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("report-download").click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith("﻿Medarbejdernr.;Navn;Timer pr. uge;Norm (timer);")).toBe(true);
  expect(csv).toContain("Mads Medarbejder");
  expect(csv).not.toContain("Carl Café");
});

test("an employee has no reports", async ({ page }) => {
  await login(page, users.employee);
  await expect(
    page.getByRole("navigation", { name: "Hovedmenu" }).getByRole("link", { name: "Rapporter" }),
  ).toHaveCount(0);
});
