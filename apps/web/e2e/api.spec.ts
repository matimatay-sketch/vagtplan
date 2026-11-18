import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const MOCK = "http://127.0.0.1:4545";
type Hook = { headers: Record<string, string>; body: string };
const hooks = async (): Promise<Hook[]> => (await fetch(`${MOCK}/__webhooks`)).json();
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

test("integration API: keys with scopes, HR, stamping, reading time and signed webhooks", async ({
  page,
  request,
}) => {
  const tag = Date.now().toString().slice(-6);
  const number = `9${tag}`;

  // The admin creates a key and a webhook under Settings → Integrations.
  await login(page, users.admin);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Integrationer" })
    .click();
  const keyForm = page.getByTestId("api-key-form");
  await keyForm.getByLabel("Navn").fill(`Integration ${tag}`);
  for (const scope of ["employees.read", "employees.write", "time.read", "time.stamp"])
    await keyForm.getByRole("checkbox", { name: new RegExp(scope.replace(".", "\\.")) }).check();
  await keyForm.getByRole("button", { name: "Opret API-nøgle" }).click();
  const key = (await keyForm.getByTestId("secret-value").textContent())!.trim();
  expect(key).toMatch(/^tk_/);
  await expect(
    page.getByTestId("api-keys").locator(`li[data-key="Integration ${tag}"]`),
  ).toContainText("time.stamp");

  const hookForm = page.getByTestId("webhook-form");
  await hookForm.getByLabel("Adresse (https)").fill(`${MOCK}/__webhook`);
  await hookForm.getByRole("checkbox", { name: /employee\.created/ }).check();
  await hookForm.getByRole("checkbox", { name: /time_entry\.approved/ }).check();
  await hookForm.getByRole("button", { name: "Tilføj webhook" }).click();
  const secret = (await hookForm.getByTestId("secret-value").textContent())!.trim();
  expect(secret).toMatch(/^whsec_/);

  const auth = { authorization: `Bearer ${key}` };
  // Without a key, or with a scope the key lacks.
  expect((await request.get("/api/v1/employees")).status()).toBe(401);
  const noScope = await request.get(`/api/v1/absences?from=${today()}&to=${today()}`, {
    headers: auth,
  });
  expect(noScope.status()).toBe(403);
  expect((await noScope.json()).error.code).toBe("insufficient_scope");

  // HR: departments, create an employee (emits employee.created).
  const depts = (await (await request.get("/api/v1/departments", { headers: auth })).json()).data;
  const butik = depts.find((d: { name: string }) => d.name === "Butik");
  const created = await request.post("/api/v1/employees", {
    headers: auth,
    data: {
      employee_number: number,
      first_name: "Api",
      last_name: "Testesen",
      birth_date: "1990-05-05",
      hired_on: today(),
      department_ids: [butik.id],
    },
  });
  expect(created.status()).toBe(201);
  const employee = (await created.json()).data;
  expect(employee.departments).toEqual([{ department_id: butik.id, primary: true }]);
  const again = await request.post("/api/v1/employees", {
    headers: auth,
    data: {
      employee_number: number,
      first_name: "X",
      last_name: "Y",
      birth_date: "1990-01-01",
      department_ids: [butik.id],
    },
  });
  expect(again.status()).toBe(409);

  // A terminal stamps in and out; a replay of the same stamp is harmless.
  const stamp = (action: string, minutesAgo: number, clientId: string) =>
    request.post("/api/v1/stamps", {
      headers: auth,
      data: {
        employee_number: number,
        action,
        at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        client_id: clientId,
      },
    });
  const inId = crypto.randomUUID();
  expect((await stamp("in", 120, inId)).status()).toBe(200);
  expect((await stamp("in", 120, inId)).status()).toBe(200);
  expect((await stamp("in", 100, crypto.randomUUID())).status()).toBe(409);
  const out = await stamp("out", 30, crypto.randomUUID());
  expect((await out.json()).data.time_entry.status).toBe("pending");

  const entries = await request.get(
    `/api/v1/time-entries?from=${today()}&to=${today()}&employee_number=${number}`,
    { headers: auth },
  );
  const rows = (await entries.json()).data;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ employee_number: number, source: "stamp", status: "pending" });

  // Approving the time in the app sends a signed time_entry.approved webhook.
  await page.goto(`/tid/godkend?uge=${today()}&q=${number}`);
  const row = page.locator('section[data-employee="Api Testesen"]').getByTestId("approval-row");
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByText("1 registrering godkendt.")).toBeVisible();

  await expect
    .poll(
      async () =>
        (await hooks())
          .filter((h) => h.body.includes(number))
          .map((h) => h.headers["turnus-event"])
          .sort(),
      {
        timeout: 15_000,
      },
    )
    .toEqual(["employee.created", "time_entry.approved"]);
  for (const h of (await hooks()).filter((x) => x.body.includes(number))) {
    const [t, v1] = h.headers["turnus-signature"]!.split(",").map((p) => p.split("=")[1]);
    expect(createHmac("sha256", secret).update(`${t}.${h.body}`).digest("hex")).toBe(v1);
  }
  const approved = JSON.parse(
    (await hooks()).find(
      (h) => h.headers["turnus-event"] === "time_entry.approved" && h.body.includes(number),
    )!.body,
  );
  expect(approved.data).toMatchObject({ id: rows[0].id, employee_number: number });

  // The deliveries are listed; a revoked key stops working.
  await page.goto("/indstillinger/integrationer");
  await expect(
    page.getByTestId("deliveries").locator('li[data-event="time_entry.approved"]').first(),
  ).toHaveAttribute("data-status", "delivered");
  await page
    .getByTestId("api-keys")
    .locator(`li[data-key="Integration ${tag}"]`)
    .getByRole("button", { name: "Spær nøgle" })
    .click();
  await expect(
    page.getByTestId("api-keys").locator(`li[data-key="Integration ${tag}"]`),
  ).toContainText("Spærret");
  expect((await request.get("/api/v1/employees", { headers: auth })).status()).toBe(401);

  // The OpenAPI document is public.
  const spec = await (await request.get("/api/v1/openapi.json")).json();
  expect(Object.keys(spec.paths)).toContain("/stamps");
});
