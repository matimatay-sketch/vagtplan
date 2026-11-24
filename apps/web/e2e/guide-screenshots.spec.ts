import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { login, users } from "./helpers";

/**
 * Screenshots for the user guides (public/vejledninger), taken with the demo
 * data. Run with `pnpm guides:screenshots` after `pnpm db:reset`, when the
 * screens have changed. Not part of the normal test run.
 */
const OUT = "public/vejledninger";
const MADS_ID = "50000000-0000-0000-0000-000000000002";

async function open(browser: Browser, phone: boolean, user: string): Promise<Page> {
  const context = await browser.newContext({
    ...(phone ? devices["Pixel 7"] : { viewport: { width: 1280, height: 820 } }),
    deviceScaleFactor: 2,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
  });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function shot(page: Page, name: string) {
  // The development marker is not part of Turnus.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}`, type: "jpeg", quality: 78 });
}

async function scrollTo(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate((e) => e.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -80));
}

test("screenshots for the guides", async ({ browser }) => {
  test.setTimeout(240_000);

  // A deviation reason, so stamping without a shift asks why (removed again at the end).
  const admin = await open(browser, false, users.admin);
  admin.on("dialog", (d) => d.accept());
  await admin.goto("/indstillinger/opsaetning");
  const reasons = admin.getByTestId("deviation-reasons");
  const reasonName = "Aftalt med lederen";
  if ((await reasons.locator(`li[data-reason="${reasonName}"]`).count()) === 0) {
    const form = reasons.getByTestId("deviation-reason-form").last();
    await form.getByLabel("Navn").fill(reasonName);
    await form
      .getByLabel("Betydning for lønnen")
      .selectOption({ label: "Tiden udbetales efter overenskomsten" });
    await form.getByLabel("stempler uden vagt").check();
    await form.getByRole("button", { name: "Opret årsag" }).click();
    await expect(reasons.locator(`li[data-reason="${reasonName}"]`).first()).toBeVisible();
  }

  try {
    // ---------------------------------------------------------------- example week
    // Shifts this week (not today for Mads, so stamping asks why), published, and a message.
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    const monday = new Date(`${today}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const day = (i: number) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    };
    const lines = ["medarbejdernummer;afdeling;dato;start;slut;pause (min);type;betegnelse"];
    for (let i = 0; i < 5; i++) {
      if (day(i) !== today) lines.push(`1002;Butik;${day(i)};08:00;16:00;30;arbejde;Kasse`);
      lines.push(`1003;Butik;${day(i)};15:00;19:00;0;arbejde;Opfyldning`);
      lines.push(`1001;Butik;${day(i)};07:00;15:00;30;arbejde;`);
    }
    lines.push(`;Butik;${day(5)};09:00;15:00;30;arbejde;Weekend`);
    const lise = await open(browser, false, users.manager);
    await lise.goto("/indlaes?type=shifts");
    const shiftPanel = lise.getByTestId("import-shifts");
    await shiftPanel.getByLabel("CSV-fil").setInputFiles({
      name: "vagter.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(lines.join("\n"), "utf8"),
    });
    await shiftPanel.getByTestId("import-check").click();
    await expect(shiftPanel.getByTestId("import-preview")).toBeVisible();
    await expect(shiftPanel.locator('tr[data-action="error"]')).toHaveCount(0);
    const commit = shiftPanel.getByTestId("import-commit");
    if (await commit.isVisible()) {
      await commit.click();
      await expect(lise.getByText(/er indlæst/)).toBeVisible();
    }
    await lise.goto("/vagtplan?visning=uge");
    const publish = lise.getByTestId("publish-button");
    if (await publish.isEnabled()) {
      await publish.click();
      const dialog = lise.getByTestId("publish-dialog");
      for (const reason of await dialog.getByTestId("override-reason").all())
        await reason.fill("Eksempel til vejledningen");
      await dialog.getByTestId("confirm-publish").click();
      await expect(lise.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();
    }
    await lise.goto("/beskeder/ny");
    await lise.getByLabel("Mads Medarbejder").check();
    await lise
      .getByLabel("Besked", { exact: true })
      .fill("Hej Mads. Kan du tage en ekstra vagt lørdag?");
    await lise.getByRole("button", { name: "Send besked" }).click();
    await expect(lise).toHaveURL(/\/beskeder\/[0-9a-f-]{36}$/);
    await lise.context().close();

    // ---------------------------------------------------------------- employee (phone)
    const emp = await open(browser, true, users.employee);
    await shot(emp, "medarbejder-oversigt.jpg");
    await emp.goto("/tid");
    await emp.getByTestId("stamp-card").getByRole("button", { name: "Stempl ind" }).click();
    await expect(emp.getByTestId("stamp-reason")).toBeVisible();
    await shot(emp, "medarbejder-stempling.jpg");
    await emp.getByRole("button", { name: "Annullér" }).click();
    await emp.goto("/min-vagtplan");
    await shot(emp, "medarbejder-vagtplan.jpg");
    await emp.goto("/fravaer");
    await shot(emp, "medarbejder-fravaer.jpg");
    await emp.goto("/beskeder");
    await shot(emp, "medarbejder-beskeder.jpg");
    await emp.goto("/profil");
    await scrollTo(emp, "notifications");
    await shot(emp, "medarbejder-profil.jpg");
    await emp.context().close();

    // ---------------------------------------------------------------- manager
    const phone = await open(browser, true, users.manager);
    await shot(phone, "leder-oversigt.jpg");
    await phone.context().close();
    const lead = await open(browser, false, users.manager);
    await lead.goto("/vagtplan?visning=uge");
    await shot(lead, "leder-vagtplan.jpg");
    await lead.goto("/tid/godkend");
    await shot(lead, "leder-godkend-tid.jpg");
    await lead.goto("/fravaer/godkend");
    await shot(lead, "leder-godkend-fravaer.jpg");
    await lead.context().close();

    // ---------------------------------------------------------------- administrator
    await admin.goto(`/medarbejdere/${MADS_ID}`);
    await shot(admin, "admin-medarbejder.jpg");
    await admin.goto("/indlaes?type=employees");
    const panel = admin.getByTestId("import-employees");
    await panel.getByLabel("CSV-fil").setInputFiles({
      name: "medarbejdere.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "medarbejdernummer;fornavn;efternavn;fødselsdato;e-mail;afdeling\n1050;Sara;Berg;03-02-1995;sara@firma.dk;Butik\n1002;;;;;Café\n1003;;;;;\n",
        "utf8",
      ),
    });
    await panel.getByTestId("import-check").click();
    await expect(panel.getByTestId("import-preview")).toBeVisible();
    await shot(admin, "admin-indlaes.jpg");
    await admin.goto("/indstillinger/opsaetning");
    await scrollTo(admin, "deviation-reasons");
    await shot(admin, "admin-opsaetning.jpg");
    await admin.goto("/lon");
    await shot(admin, "admin-loen.jpg");
  } finally {
    await admin.goto("/indstillinger/opsaetning");
    const items = reasons.locator(`li[data-reason="${reasonName}"]`);
    while ((await items.count()) > 0) {
      await items
        .first()
        .getByRole("button", { name: `Slet ${reasonName}` })
        .click();
      await admin.waitForTimeout(800);
      await admin.reload();
    }
  }
});
