import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

test("consultant sets up overtime by clock hours with a Sunday rate in the form", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  const name = `Industri ${Date.now()}`;
  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  const form = page.getByTestId("new-agreement");
  await form.getByLabel("Navn på overenskomsten").fill(name);
  await form.getByLabel("Gyldig fra").fill("2026-03-01");
  await form.getByRole("button", { name: "Ny overenskomst" }).click();
  await expect(page.getByText("Overenskomsten er oprettet som kladde.")).toBeVisible();
  const editor = page.getByTestId("agreement-editor");

  const add = page.getByTestId("add-rule");
  await add.getByLabel("Navn på reglen").fill("Overarbejde");
  await add.getByLabel("Type").selectOption("overtime");
  await add.getByRole("button", { name: "Tilføj", exact: true }).click();
  const fields = page.locator('details[data-rule="overarbejde"]').getByTestId("overtime-fields");
  await expect(fields).toBeVisible();

  await fields.getByLabel("Overarbejde er").selectOption("outside_planned");
  await fields.getByLabel("Trinene tælles").selectOption("since_planned_end");
  await fields.getByLabel("Betaling").selectOption("payout_and_time_off");
  await fields.getByLabel("Lønart for afspadsering").fill("AFSPADSERING");

  // 1.–2. klokketime 48,10 kr., derefter 76,80 kr.
  const first = fields.getByTestId("overtime-tier").first();
  await first.getByLabel("Beløb").selectOption("ore_per_hour");
  await first.getByLabel("Kr. pr. time").fill("48,10");
  await first.getByLabel("Lønart").fill("OT_1_2");
  await fields.getByRole("button", { name: "Tilføj trin" }).click();
  await expect(first.getByLabel("Timer i trinnet")).toHaveValue("2");
  const rest = fields.getByTestId("overtime-tier").nth(1);
  await rest.getByLabel("Beløb").selectOption("ore_per_hour");
  await rest.getByLabel("Kr. pr. time").fill("76,80");
  await rest.getByLabel("Lønart").fill("OT_3");

  // Søn- og helligdage: their own rate, before the tiers.
  await fields.getByRole("button", { name: "Tilføj tidsrum" }).click();
  const sunday = fields.getByTestId("window");
  await expect(sunday.getByRole("button", { name: "Søn" })).toHaveAttribute("aria-pressed", "true");
  await sunday.getByLabel("Lønart").fill("OT_SOEN");
  await sunday.getByLabel("Beløb").selectOption("ore_per_hour");
  await sunday.getByLabel("Kr. pr. time").fill("95,75");
  await sunday.getByLabel("Kun hvis vagten startede").selectOption("at_or_after");

  await editor.getByRole("button", { name: "Validér" }).click();
  await expect(page.getByTestId("agreement-check")).toContainText("Dokumentet er gyldigt.");
  await editor.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();

  await page.reload();
  const saved = page.locator('details[data-rule="overarbejde"]');
  await saved.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await expect(saved.getByLabel("Trinene tælles")).toHaveValue("since_planned_end");
  await expect(saved.getByTestId("overtime-tier")).toHaveCount(2);
  await expect(saved.getByTestId("window").getByLabel("Lønart")).toHaveValue("OT_SOEN");
});
