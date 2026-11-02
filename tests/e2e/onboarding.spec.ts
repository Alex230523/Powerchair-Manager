import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Parcours d'accueil on a phone (390 px): the proposed « Nouveau coach »
 * template added in Réglages › Membres et droits, a journey started, the
 * « Bienvenue » card on the home page with its progress, a step read.
 * Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("a welcome journey, from the template to the home card", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `onboarding-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Accueil", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club accueil','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/settings/members");
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Parcours d'accueil" }) }).last();
    await card.getByRole("button", { name: "Ajouter le modèle « Nouveau coach »" }).click();
    await expect(card.locator(".onboarding-templates").getByText("Nouveau coach", { exact: true })).toBeVisible();
    await axe(page, "onboarding settings");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await card.getByLabel("Personne").selectOption({ label: "Présidente Accueil" });
    await card.getByRole("button", { name: "Lancer un parcours" }).click();
    await expect(card.locator(".onboarding-runs")).toContainText("Présidente Accueil · Nouveau coach");

    await page.goto("/fr");
    const welcome = page.locator(".journey-card");
    await expect(welcome.getByRole("heading", { name: "Bienvenue : Nouveau coach" })).toBeVisible();
    await expect(welcome.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(welcome.getByText("Prochaine étape : Mot de bienvenue du président")).toBeVisible();
    await welcome.getByText("Toutes les étapes").click();
    await welcome.getByRole("button", { name: "J'ai lu : Mot de bienvenue du président" }).click();
    await expect(welcome.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await axe(page, "welcome card");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/onboarding-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
