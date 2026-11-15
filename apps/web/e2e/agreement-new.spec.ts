import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("consultant creates an agreement from scratch with on-call rates by day type", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  const name = `Rådighedsaftale ${Date.now()}`;
  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  const form = page.getByTestId("new-agreement");
  await form.getByLabel("Navn på overenskomsten").fill(name);
  // The law baseline (basis-dk) applies from 1 July 2024.
  await form.getByLabel("Gyldig fra").fill("2024-01-01");
  await form.getByRole("button", { name: "Ny overenskomst" }).click();
  await expect(page.getByText("Lovgrundlaget gælder fra 01-07-2024.")).toBeVisible();
  await form.getByLabel("Gyldig fra").fill("2026-01-01");
  await form.getByRole("button", { name: "Ny overenskomst" }).click();
  await expect(page.getByText("Overenskomsten er oprettet som kladde.")).toBeVisible();
  const editor = page.getByTestId("agreement-editor");
  await expect(editor).toBeVisible();

  // On-call: 24,69 kr. an hour on weekdays, 29,53 kr. on Saturday, Sunday and holidays.
  const add = page.getByTestId("add-rule");
  await add.getByLabel("Navn på reglen").fill("Rådighed");
  await add.getByLabel("Type").selectOption("on_call");
  await add.getByRole("button", { name: "Tilføj", exact: true }).click();
  const fields = page.locator('details[data-rule="raadighed"]').getByTestId("on-call-fields");
  await expect(fields).toBeVisible();
  await fields.getByLabel("Kr. pr. time").first().fill("24,69");
  await fields.getByRole("button", { name: "Tilføj tidsrum" }).click();
  const weekend = fields.getByTestId("window");
  await expect(weekend.getByRole("button", { name: "Lør" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await weekend.getByLabel("Lønart").fill("RAADIGHED_WE");
  await weekend.getByLabel("Kr. pr. time").fill("29,53");
  await editor.getByRole("button", { name: "Validér" }).click();
  await expect(page.getByTestId("agreement-check")).toContainText("Dokumentet er gyldigt.");
  await editor.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();

  // By hand: Friday 16–24 is 8 h × 24,69 = 197,52 kr.; Saturday 24 h × 29,53 = 708,72 kr.
  const weeks = page.getByTestId("test-weeks");
  await weeks.getByRole("button", { name: "Ny testuge" }).click();
  const tw = weeks.getByTestId("test-week-form");
  await tw.getByLabel("Navn").fill("Rådighed fredag og lørdag");
  await tw.getByLabel("Uge (mandag)").fill("2026-03-02");
  const rows = [
    ["2026-03-06", "16:00", "00:00"],
    ["2026-03-07", "00:00", "00:00"],
  ];
  for (const [i, [date, start, end]] of rows.entries()) {
    if (i > 0) await tw.getByRole("button", { name: "Tilføj vagt" }).click();
    await tw.getByLabel(`Dato ${i + 1}`).fill(date!);
    await tw.getByLabel(`Start ${i + 1}`).fill(start!);
    await tw.getByLabel(`Slut ${i + 1}`).fill(end!);
    await tw.getByLabel(`Ubetalt pause (min) ${i + 1}`).fill("0");
    await tw.getByLabel(`Type ${i + 1}`).selectOption("on_call");
  }
  await tw.getByLabel("Lønart 1", { exact: true }).fill("RAADIGHED");
  await tw.getByLabel("Timer 1").fill("8");
  await tw.getByLabel("Beløb (kr.) 1").fill("197,52");
  await tw.getByRole("button", { name: "Tilføj lønart" }).click();
  await tw.getByLabel("Lønart 2", { exact: true }).fill("RAADIGHED_WE");
  await tw.getByLabel("Timer 2").fill("24");
  await tw.getByLabel("Beløb (kr.) 2").fill("708,72");
  await tw.getByRole("button", { name: "Gem testuge" }).click();
  await expect(weeks.locator('[data-test-week="Rådighed fredag og lørdag"]')).toContainText(
    "Kladden: Bestået",
  );
});
