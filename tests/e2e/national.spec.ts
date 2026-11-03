import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 6: the federation creates a national team with its PF2 rule. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("national teams: create a team, readable at 390 px", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const email = `national-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Fédération Nationale", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'federation') RETURNING id", [`Fédération ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [federation, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [federation, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/fr/federation/national");
    await expect(page.getByRole("heading", { level: 1, name: "Équipes nationales" })).toBeVisible();
    await page.getByLabel("Nom (ex. Belgique U18)").fill("Belgique U18");
    await page.getByLabel("Catégorie", { exact: true }).selectOption("u18");
    await page.getByLabel("PF2 au plus parmi les sélectionnés (vide : pas de limite)").fill("2");
    await page.getByRole("button", { name: "Enregistrer" }).first().click();
    await expect(page.getByRole("heading", { name: /Belgique U18/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await axe(page, "national teams");
  } finally {
    await db.end();
  }
});
