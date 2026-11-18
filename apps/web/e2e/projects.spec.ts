import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

function mondayIn(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const plus = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const MADS = "Mads Medarbejder";

test("projects: create, allocate on a shift, see hours and export CSV", async ({ page }) => {
  const tag = Date.now().toString(36).toUpperCase();
  const a = `A-${tag}`;
  const b = `B-${tag}`;
  const week = mondayIn(17);
  const day = plus(week, 2);

  // The admin creates two projects; one limited to Butik.
  await login(page, users.admin);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Projekter" })
    .click();
  const form = page.getByTestId("project-form");
  await form.getByLabel("Projektnr.").fill(a);
  await form.getByLabel("Projekt", { exact: true }).fill("Ombygning");
  await form.getByLabel(/Kunde/).fill("Kunde A/S");
  await form.getByText("Butik", { exact: true }).click();
  await form.getByRole("button", { name: "Opret projekt" }).click();
  await expect(page.getByTestId("project-list")).toContainText(a);
  await form.getByLabel("Projektnr.").fill(b);
  await form.getByLabel("Projekt", { exact: true }).fill("Vareoptælling");
  await form.getByRole("button", { name: "Opret projekt" }).click();
  await expect(page.getByTestId("project-list")).toContainText(b);
  // Numbers are unique among active projects.
  await form.getByLabel("Projektnr.").fill(a.toLowerCase());
  await form.getByLabel("Projekt", { exact: true }).fill("Dublet");
  await form.getByRole("button", { name: "Opret projekt" }).click();
  await expect(form.getByText("Projektnummeret er allerede i brug.")).toBeVisible();
  await page.context().clearCookies();

  // The manager allocates 2 hours to A and the rest to B.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, MADS, day);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("08:00");
  await shift.getByLabel("Slut").fill("16:00");
  // Projects are values of the "Projekt" posting dimension.
  const editor = shift.getByTestId("posting-editor");
  await editor.getByRole("button", { name: "Tilføj kontering" }).click();
  await editor.getByRole("button", { name: "Tilføj kontering" }).click();
  await editor.getByLabel("Projekt 1").selectOption({ label: `${b} · Vareoptælling` });
  await expect(editor.getByLabel("Fordeling 1")).toHaveValue("rest");
  await editor.getByLabel("Projekt 2").selectOption({ label: `${a} · Ombygning` });
  await editor.getByLabel("Fordeling 2").selectOption("minutes");
  await editor.getByLabel("Minutter 2").fill("600");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  // 600 minutes do not fit in 7.5 paid hours.
  await expect(editor.getByText("Der er fordelt mere tid end vagtens betalte tid")).toBeVisible();
  await editor.getByLabel("Minutter 2").fill("120");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  const card = c.getByTestId("shift-card");
  await expect(card.getByTestId("posting-badge")).toHaveText("2");

  await card.click();
  await expect(page.getByTestId("shift-form").getByTestId("posting-row")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // Hours per project: 8 h minus 30 unpaid minutes = 7.5 h; A 2 h, B 5.5 h.
  await page.goto(`/projekter?fra=${day}&til=${day}`);
  await expect(page.getByRole("heading", { name: "Projektliste" })).toHaveCount(0);
  const summary = page.getByTestId("project-summary");
  await expect(summary.getByRole("row").filter({ hasText: a })).toContainText("2 t");
  await expect(summary.getByRole("row").filter({ hasText: b })).toContainText("5,5 t");
  await expect(summary.getByRole("row").filter({ hasText: a })).toContainText(MADS);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Hent CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`projekttimer_${day}_${day}.csv`);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith("﻿Projektnr.;Projekt;Kunde;Dato;Start;Slut;")).toBe(true);
  expect(csv).toContain(
    `${a};Ombygning;Kunde A/S;${day};08:00;16:00;1002;${MADS};Butik;Kladde;120;2,00\r\n`,
  );
  expect(csv).toContain(
    `${b};Vareoptælling;;${day};08:00;16:00;1002;${MADS};Butik;Kladde;330;5,50`,
  );
  await page.context().clearCookies();

  // Employees see no project hours by default.
  await login(page, users.employee);
  await expect(
    page.getByRole("navigation", { name: "Hovedmenu" }).getByRole("link", { name: "Projekter" }),
  ).toHaveCount(0);
  const res = await page.request.get(`/projekter/eksport?fra=${day}&til=${day}`);
  expect(res.status()).toBe(403);
});
