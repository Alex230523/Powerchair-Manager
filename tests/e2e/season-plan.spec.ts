import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 16 on a phone (390 px): the card on the president's home 30 days before
 * the end of the season, the assistant's steps, one skipped and still
 * skipped after a reload, then « Lancer » and the sendings it scheduled,
 * each cancellable. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("the president prepares the next season on a phone", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `season-plan-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Saison", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club de la rentrée','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-2026',CURRENT_DATE-300,CURRENT_DATE+30) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles')", [club, season]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: "La saison se termine dans 30 jour(s)" })).toBeVisible();
    await page.getByRole("link", { name: "Préparer la saison suivante" }).first().click();
    await expect(page.getByRole("heading", { name: "Préparer la saison suivante", level: 1 })).toBeVisible();
    await axe(page, "season plan");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // The review: marked as done.
    await page.getByRole("button", { name: /Bilan de la saison/ }).click();
    await page.getByRole("button", { name: "Marquer comme fait" }).click();
    await expect(page.getByRole("button", { name: /Bilan de la saison.*Fait/ })).toBeVisible();
    // The email step is skipped, and stays skipped after a reload.
    await page.getByRole("button", { name: /Email « Nouvelle saison »/ }).click();
    await page.getByRole("button", { name: "Ignorer cette étape" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /Email « Nouvelle saison ».*Ignoré/ })).toBeVisible();
    await axe(page, "season plan resumed");

    // Launch: the season is created, the check is scheduled and can be cancelled.
    await page.getByRole("button", { name: /Récapitulatif et lancement/ }).click();
    await expect(page.getByText("Saison 2026-2027 et 1 équipe(s)")).toBeVisible();
    await page.getByRole("button", { name: "Lancer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Programmé" })).toBeVisible();
    await expect(page.getByText("Vérification des données").last()).toBeVisible();
    await expect(page.getByText("Email « Nouvelle saison »", { exact: true })).toHaveCount(1);
    await axe(page, "season plan launched");
    await page.getByRole("button", { name: "Annuler : Vérification des données" }).click();
    await expect(page.locator(".badge", { hasText: "Annulé" })).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM season WHERE organization_id=$1 AND name='2026-2027'", [club])).rows[0].n).toBe(1);
    await page.screenshot({ path: "test-results/season-plan-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
