import { expect, type Page } from "@playwright/test";

export const users = {
  admin: "admin@demo.dk",
  manager: "leder@demo.dk",
  employee: "medarbejder@demo.dk",
  young: "ung@demo.dk",
} as const;

export async function login(page: Page, email: string, password = "Demo1234!") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/oversigt/);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
