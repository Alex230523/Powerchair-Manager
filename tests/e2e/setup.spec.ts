import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (C3): a new club's president sees "Bien démarrer" computed from the
 * data, each step moves it on, it can be hidden and shown again from
 * Settings; empty pages offer their first action.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("getting started of a new club", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `setup-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Setup president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Setup club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A new club: 0 of 8, each step with "Commencer".
    await page.goto("/fr");
    const setup = page.getByRole("region", { name: "Bien démarrer" });
    await expect(setup).toBeVisible();
    await expect(setup).toContainText("0 sur 8");
    await expect(setup.getByRole("progressbar", { name: "Configuration du club" })).toHaveAttribute("aria-valuenow", "0");
    await expect(setup.getByRole("link", { name: /^Commencer/ })).toHaveCount(8);
    await axe(page, "home with getting started");

    // 2. "Commencer" opens the right form; the real data moves the card on.
    await setup.getByRole("link", { name: "Commencer : Créer la saison en cours" }).click();
    await expect(page).toHaveURL(/\/fr\/club\/manage#teams$/);
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-10,CURRENT_DATE+300)", [club]);
    await page.goto("/fr");
    await expect(setup).toContainText("1 sur 8");
    await expect(setup.getByRole("link", { name: /^Commencer/ })).toHaveCount(7);

    // 3. Hidden, then shown again from Settings > Club.
    await setup.getByRole("button", { name: "Masquer" }).click();
    await expect(setup).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(setup).toHaveCount(0);
    await page.goto("/fr/settings/club");
    const again = page.getByRole("region", { name: "Bien démarrer" });
    await expect(again).toContainText("La carte est masquée sur l’accueil.");
    await again.getByRole("button", { name: "Afficher à nouveau sur l’accueil" }).click();
    await expect(again.getByRole("button", { name: "Afficher à nouveau sur l’accueil" })).toHaveCount(0);
    await page.goto("/fr");
    await expect(setup).toContainText("1 sur 8");

    // 4. An empty page offers its first action: the players' import.
    await page.goto("/fr/players");
    await page.getByRole("button", { name: "Importer vos joueurs depuis Excel" }).click();
    await expect(page.getByRole("dialog", { name: /Importer des joueurs/ })).toBeVisible();
  } finally {
    await db.end();
  }
});
