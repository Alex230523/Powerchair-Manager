import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (J4): a classification day from end to end. The federation writes
 * its PF1/PF2 texts and creates a day for two clubs; club A registers a
 * player; the federation marks her present and decides PF2, then publishes;
 * club A reads the result and the badge's tip on keyboard focus; the
 * federation sees the team's players (sporting information only).
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
}

test("classification day: texts, invitation, registration, decision, publication, team players", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `j4-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "J4 fédération", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('J4 fédération','federation') RETURNING id")).rows[0].id;
    const clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('J4 club A','club',$1) RETURNING id", [federation])).rows[0].id;
    const clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('J4 club B','club',$1) RETURNING id", [federation])).rows[0].id;
    const mandate: Record<string, string> = {};
    for (const [key, org, role] of [
      ["F", federation, "federation_president"],
      ["A", clubA, "club_president"],
      ["B", clubB, "club_president"],
    ] as const) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
      mandate[key] = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
    }
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
    for (const name of ["Ana Martin", "Bilal Haddad"]) {
      const id = (
        await db.query(
          "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,$2,'2008-01-01',ARRAY['player'] FROM p RETURNING id",
          [clubA, name],
        )
      ).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
    }
    const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    await page.goto("/fr");
    await switchTo(page, mandate.F);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The federation writes its PF2 text and creates the day.
    await page.goto("/fr/federation/licenses");
    const days = page.locator(".classification-days");
    await days.getByText("Textes PF1 et PF2").click();
    await days.getByLabel("PF2 en français").fill("Joueur moins limité, deux au plus sur le terrain.");
    await days.getByRole("button", { name: "Enregistrer les textes" }).click();
    await expect(days.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    await days.getByText("Nouvelle journée de classification").click();
    await days.getByLabel("Date de la journée").fill(iso(10));
    await days.getByLabel("Inscriptions jusqu'au").fill(iso(5));
    await days.getByLabel("Lieu (adresse ou précision)").fill("Hall sportif de Namur");
    await days.getByLabel("J4 club A").check();
    await days.getByLabel("J4 club B").check();
    await axe(page, "new classification day");
    await days.getByRole("button", { name: "Créer la journée" }).click();
    await expect(days.getByRole("status").filter({ hasText: "Journée créée" })).toBeVisible();
    await expect(days.locator(".classification-day")).toContainText("Clubs invités : J4 club A, J4 club B");

    // 2. Club A registers Ana.
    await switchTo(page, mandate.A);
    await page.goto("/fr/licenses");
    const club = page.locator(".classification-days");
    await expect(club.getByRole("heading", { level: 3 })).toContainText("Ouverte");
    await club.getByLabel(/^Ana Martin/).check();
    await club.getByRole("button", { name: "Inscrire (1)" }).click();
    await expect(club.getByRole("row").filter({ hasText: "Ana Martin" })).toContainText("Résultat après publication");
    await axe(page, "club registration");

    // 3. The federation marks her present, decides PF2 and publishes.
    await switchTo(page, mandate.F);
    await page.goto("/fr/federation/licenses");
    await days.getByLabel("Présence : Ana Martin").selectOption("yes");
    await days.getByLabel("Décision : Ana Martin").selectOption("PF2");
    await days.getByLabel("Commentaire : Ana Martin").fill("Bonne conduite au menton");
    await days.getByRole("button", { name: "Enregistrer : Ana Martin" }).click();
    await expect(days.getByText("Tout est pointé et décidé")).toBeVisible();
    await axe(page, "marking");
    await days.getByRole("button", { name: /^Publier les résultats/ }).click();
    await expect(days.getByRole("heading", { level: 3 })).toContainText("Publiée");

    // 4. Club A reads the result; the badge's tip opens on focus, closes with Escape.
    await switchTo(page, mandate.A);
    await page.goto("/fr/licenses");
    await expect(club.getByRole("row").filter({ hasText: "Ana Martin" })).toContainText("Bonne conduite au menton");
    const row = page.locator(".ledger tbody tr").filter({ hasText: "Ana Martin" }).first();
    await row.getByRole("button", { name: "PF2" }).focus();
    const tip = row.getByRole("tooltip").filter({ hasText: "deux au plus sur le terrain" });
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await expect(page.locator(".ledger tbody tr").filter({ hasText: "Bilal Haddad" }).first()).toContainText("Non définie");
    await axe(page, "club results");

    // 5. The federation sees the team's players: sporting information only.
    await switchTo(page, mandate.F);
    await page.goto("/fr/federation/teams");
    await page.getByRole("button", { name: "Voir les joueurs : J4 club A · Aigles" }).click();
    const players = page.locator(".team-players");
    await expect(players.getByRole("row").filter({ hasText: "Ana Martin" })).toContainText("PF2");
    await expect(players.getByRole("row").filter({ hasText: "Bilal Haddad" })).toContainText("Non définie");
    await expect(players).not.toContainText("@");
    await axe(page, "team players");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/fr/federation/licenses", "/fr/federation/teams"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await axe(page, `390 ${path}`);
    }
  } finally {
    await db.end();
  }
});
