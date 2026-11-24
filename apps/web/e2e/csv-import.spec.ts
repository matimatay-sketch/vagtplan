import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const stamp = Date.now().toString(36);

/** Chooses a CSV file (as Excel saves it: semicolons) and checks it. */
async function checkFile(page: Page, kind: string, csv: string) {
  const panel = page.getByTestId(`import-${kind}`);
  await panel.getByLabel("CSV-fil").setInputFiles({
    name: `${kind}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await panel.getByTestId("import-check").click();
  await expect(panel.getByTestId("import-preview")).toBeVisible();
  return panel;
}

/** A Monday some weeks ahead, as dd-mm-yyyy (the Danish format in spreadsheets). */
function mondayAhead(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks - ((d.getUTCDay() + 6) % 7));
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

test("departments, employees, shifts and balances are imported from CSV files after a preview", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, users.admin);

  // Departments: created, then renamed. The template can be downloaded.
  await page.goto("/indlaes?type=departments");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Hent skabelon" }).click();
  expect((await download).suggestedFilename()).toBe("turnus_departments_skabelon.csv");
  let panel = await checkFile(page, "departments", `navn;nyt navn\nLager ${stamp};\n`);
  await expect(panel.getByTestId("import-counts")).toHaveText("1 opret");
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText("1 linje er indlæst.")).toBeVisible();
  panel = await checkFile(
    page,
    "departments",
    `navn;nyt navn\nLager ${stamp};Lager ${stamp} Nord\n`,
  );
  await expect(panel.locator('tr[data-line="2"]')).toContainText(
    `Omdøb Lager ${stamp} til Lager ${stamp} Nord`,
  );
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText("1 linje er indlæst.")).toBeVisible();

  // Employees: an error on a line blocks the whole file; nothing is saved.
  const nr = `9${stamp}`;
  const head =
    "medarbejdernummer;fornavn;efternavn;fødselsdato;e-mail;afdeling;overenskomst;timer pr. uge;lønform;lønperiode;kontrakt fra";
  await page.goto("/indlaes?type=employees");
  panel = await checkFile(
    page,
    "employees",
    `${head}\n${nr};Ib;Import;31-02-1995;;Butik;;;;;\n1002;;;;;Café;;;;;`,
  );
  await expect(panel.locator('tr[data-line="2"]')).toContainText("Ugyldig dato: 31-02-1995");
  await expect(panel.getByText("Ret fejlene i filen")).toBeVisible();
  await expect(panel.getByTestId("import-commit")).toHaveCount(0);

  // Corrected: a new employee with a contract, and Mads (1002) gets an extra department.
  panel = await checkFile(
    page,
    "employees",
    `${head}\n${nr};Ib;Import;03-02-1995;ib.${stamp}@example.dk;Butik;EKSEMPEL – Detail (fiktiv);30;timeløn;Timelønnede (14 dage);01-12-2026\n1002;;;;;Butik;;;;;`,
  );
  await expect(panel.getByTestId("import-counts")).toHaveText(/1 opret/);
  await expect(panel.locator('tr[data-line="2"]')).toContainText(
    `Opret Ib Import (${nr}) i Butik med kontrakt fra`,
  );
  await expect(panel.locator('tr[data-line="3"]')).toContainText("1002: ingen ændringer");
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText("1 linje er indlæst.")).toBeVisible();
  await page.goto(`/medarbejdere?q=${nr}`);
  await expect(page.getByText("Ib Import").first()).toBeVisible();

  // Shifts: imported as drafts; the same file again changes nothing.
  // Week 45 ahead: no other test uses it.
  const monday = mondayAhead(45);
  const shifts = `medarbejdernummer;afdeling;dato;start;slut;pause (min);type;betegnelse\n1002;Butik;${monday};07:00;15:00;30;arbejde;Import ${stamp}\n`;
  await page.goto("/indlaes?type=shifts");
  panel = await checkFile(page, "shifts", shifts);
  await expect(panel.getByTestId("import-counts")).toHaveText("1 opret");
  await expect(panel.locator('tr[data-line="2"]')).toContainText("Mads Medarbejder · Butik");
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText(/1 linje er indlæst\. Vagterne ligger som kladder/)).toBeVisible();
  panel = await checkFile(page, "shifts", shifts);
  await expect(panel.getByTestId("import-counts")).toHaveText("1 uændret");
  await expect(panel.getByText("Vagten findes allerede")).toBeVisible();
  await expect(panel.getByText("Der er intet at indlæse")).toBeVisible();

  // Balances: first a new balance, then an adjustment; both are postings with the reason.
  await page.goto("/indlaes?type=balances");
  panel = await checkFile(
    page,
    "balances",
    "medarbejdernummer;saldo;dage;begrundelse\n1002;Ferie;20;Saldo fra tidligere system\n",
  );
  await expect(panel.locator('tr[data-line="2"]')).toContainText(
    /Mads Medarbejder · Ferie .* → 20 dage/,
  );
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText("1 linje er indlæst.")).toBeVisible();
  panel = await checkFile(
    page,
    "balances",
    "medarbejdernummer;saldo;dage;begrundelse\n1002;ferie;1,5;Ekstra dage efter aftale\n",
  );
  await panel.getByLabel("et tillæg eller fradrag").check();
  await expect(panel.locator('tr[data-line="2"]')).toContainText("20 → 21,5 dage (+1,5)");
  await panel.getByTestId("import-commit").click();
  await expect(page.getByText("1 linje er indlæst.")).toBeVisible();
});

test("an employee has no import, and a manager only sees what she may import", async ({ page }) => {
  await login(page, users.employee);
  await page.goto("/indlaes");
  await expect(page).toHaveURL(/adgang=nej/);
  await page.context().clearCookies();
  await login(page, users.manager);
  await page.goto("/indlaes");
  const kinds = page.getByRole("navigation", { name: "Indlæs fra fil" });
  await expect(kinds.getByRole("link", { name: "Vagtplan" })).toBeVisible();
  await expect(kinds.getByRole("link", { name: "Afdelinger" })).toHaveCount(0);
});
