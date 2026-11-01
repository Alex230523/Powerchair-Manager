import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (R1): places per team, set in Settings > Activities, shown on the cards and when moving a player. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("places per team: settings, card, move warning", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `places-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Places president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Places club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const tigers = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Tigres') RETURNING id", [club, season])).rows[0].id;
    for (const [name, team] of [
      ["Zoé Martin", lions],
      ["Yanis Peeters", tigers],
    ]) {
      const p = (
        await db.query(
          "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2010-01-01','{player}' FROM p RETURNING id",
          [club, name],
        )
      ).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-1)", [club, team, p]);
    }
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Settings > Activities: one line per team, places edited in place.
    await page.goto("/fr/settings/activities");
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Places par équipe" }) });
    await panel.getByLabel("Places (vide : sans limite) : Lions").fill("2");
    await panel.getByLabel("Places (vide : sans limite) : Tigres").fill("1");
    await panel.getByRole("button", { name: "Enregistrer" }).click();
    await expect(panel.getByRole("status")).toContainText("Places enregistrées.");
    await axe(page, "settings places");

    // 2. The cards: "1 sur 2 places", "Complet" for the Tigers.
    await page.goto("/fr/teams");
    await expect(page.locator(".team-card").filter({ hasText: "Lions" })).toContainText("1 sur 2 places");
    await expect(page.locator(".team-card").filter({ hasText: "Tigres" })).toContainText("Complet");
    await axe(page, "team cards");

    // 3. Moving Zoé into the full Tigers: said, not blocked.
    await page.goto(`/fr/teams/${lions}`);
    await page.getByRole("button", { name: /Déplacer vers/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Équipe de destination").selectOption({ label: "Tigres" });
    await expect(dialog.getByRole("status")).toContainText("Tigres est complète (1 sur 1 places)");
    await axe(page, "move dialog");
    await dialog.getByRole("button", { name: "Déplacer", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("l’équipe dépasse maintenant ses places");
  } finally {
    await db.end();
  }
});
