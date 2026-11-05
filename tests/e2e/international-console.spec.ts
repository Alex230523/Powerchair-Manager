import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 05/11/2026: the federation's rulebook page (international, step 2) and the operator's console (step 1), at 390 px. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function signIn(page: Page, db: Pool, name: string, email: string) {
  await prepareSignIn(page, db, name, email, "Browser-test-passphrase-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
  return (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
}
async function mandate(page: Page, db: Pool, user: string, org: string, role: string) {
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
  const id = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
  await page.goto("/fr");
  await page.evaluate(async (mandateId) => {
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
  }, id);
}

test("the federation sets its country and its scale, every save versioned", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé règlement','federation') RETURNING id")).rows[0].id as string;
    const user = await signIn(page, db, "Présidente Règlement", `policy-${stamp}@example.test`);
    await mandate(page, db, user, fed, "federation_president");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/federation/policy");
    await expect(page.getByText("Barème BPCF 2025, sans modification.")).toBeVisible();
    await page.getByLabel("Pays de la fédération").selectOption("NL");
    await page.getByRole("button", { name: "Enregistrer le pays" }).click();
    await expect.poll(async () => (await db.query("SELECT country_code FROM organization WHERE id=$1", [fed])).rows[0].country_code).toBe("NL");
    const academy = page.getByRole("group", { name: "Transfert international" }).getByLabel(/^Académie/);
    await academy.fill("600");
    await page.getByRole("button", { name: "Enregistrer le barème" }).click();
    await expect(page.getByText(/^Version 1, /)).toBeVisible();
    await expect(page.locator("#policy-history")).toContainText("Version 1");
    await axe(page, "policy");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Revenir au barème BPCF 2025" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revenir au barème BPCF 2025" }).click();
    await expect(page.getByText("Barème BPCF 2025, sans modification.")).toBeVisible();
  } finally {
    await db.end();
  }
});

test("an operator reads the console; a club president is refused", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club console','club') RETURNING id")).rows[0].id as string;
    const user = await signIn(page, db, "Alex Exploitant", `operator-${stamp}@example.test`);
    await mandate(page, db, user, club, "club_president");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/console");
    await expect(page.getByText("Cette console est réservée aux exploitants de la plateforme.")).toBeVisible();
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [user]);
    await page.goto("/fr/console");
    await expect(page.getByRole("heading", { level: 1, name: "Console de la plateforme" })).toBeVisible();
    await expect(page.locator(".console-bar")).toContainText("Console");
    await expect(page.locator(".console-tiles")).toContainText("Organisations");
    await axe(page, "console home");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("tab", { name: "Organisations" }).click();
    await page.getByRole("searchbox").fill("Club console");
    await page.getByRole("button", { name: "Club console" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Club console" })).toBeVisible();
    await page.getByLabel("Nouvelle note (jamais visible par l'organisation)").fill("Premier contact.");
    await page.getByRole("button", { name: "Ajouter la note" }).click();
    await expect(page.getByText("Premier contact.")).toBeVisible();
    await axe(page, "console organisation");
    await page.getByRole("tab", { name: "Opérateurs" }).click();
    await expect(page.getByRole("rowheader", { name: "Alex Exploitant" })).toBeVisible();
    await page.getByRole("tab", { name: "Supervision" }).click();
    await expect(page.getByRole("heading", { name: "Tâches planifiées" })).toBeVisible();
    await axe(page, "console supervision");
  } finally {
    await db.end();
  }
});
