import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (I3): the federation creates a club, invites its president and a referee, sees the teams. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("federation space: clubs and presidents, teams, referees", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const email = `federation-${stamp}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Fédération test", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'federation') RETURNING id", [`Fédération ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [federation, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [federation, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The menu in the order of the federation's day.
    // The group is folded on the home page: the links are there, in this order.
    const links = (await page.locator(".sidebar nav a").allTextContents()).map((x) => x.trim());
    const order = ["Clubs et présidents", "Équipes", "Tournois", "Arbitres et désignations", "Licences et classifications", "Formations des coachs"].map((l) => links.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));

    // 2. A new club and its president's invitation.
    await page.goto("/fr/federation/clubs");
    await expect(page.getByText("Aucun club affilié pour l'instant.")).toBeVisible();
    await axe(page, "clubs empty");
    await page.getByRole("button", { name: "Nouveau club" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom du club").fill("Lions de Namur");
    await dialog.getByLabel("Ville").fill("Namur");
    await dialog.getByLabel("Numéro d'affiliation (facultatif)").fill(`BPCF-${stamp}`);
    await dialog.getByLabel("Forme").selectOption("asbl");
    await dialog.getByLabel("Prénom").fill("Claire");
    await dialog.getByLabel("Nom", { exact: true }).fill("Présidente");
    await dialog.getByLabel("Adresse email").fill(`claire-${stamp}@example.test`);
    await axe(page, "new club");
    await dialog.getByRole("button", { name: "Créer le club et inviter le président" }).click();
    await expect(page.getByText("Lions de Namur est créé. L'invitation du président est partie.")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Lions de Namur" });
    await expect(row).toContainText("Invitation envoyée");
    await expect(row).toContainText("En attente du président");
    await axe(page, "clubs list");
    await row.getByRole("button", { name: "Renvoyer : Lions de Namur" }).click();
    await expect(page.getByText("Nouvelle invitation envoyée.")).toBeVisible();
    const club = (await db.query("SELECT id FROM organization WHERE federation_id=$1", [federation])).rows[0].id;
    expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL AND accepted_at IS NULL", [club])).rows[0].n).toBe(1);

    // 3. Teams: the club's teams for the season, read only.
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name,category,level) VALUES($1,$2,'Lions U18','U18','Régional')", [club, season]);
    await page.goto("/fr/federation/teams");
    await expect(page.getByRole("row").filter({ hasText: "Lions U18" })).toContainText("Lions de Namur");
    await page.getByLabel("Catégorie").selectOption("U18");
    await expect(page.getByText("1 équipe", { exact: true })).toBeVisible();
    await axe(page, "teams");

    // 4. Referees: invite one, it waits in the list.
    await page.goto("/fr/federation/referees");
    await page.getByRole("button", { name: "Inviter un arbitre" }).click();
    const referee = page.getByRole("dialog");
    await referee.getByLabel("Prénom").fill("Rita");
    await referee.getByLabel("Nom", { exact: true }).fill("Arbitre");
    await referee.getByLabel("Adresse email").fill(`rita-${stamp}@example.test`);
    await referee.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText(`Rita Arbitre · rita-${stamp}@example.test · Invitation envoyée`)).toBeVisible();
    await axe(page, "referees");
  } finally {
    await db.end();
  }
});
