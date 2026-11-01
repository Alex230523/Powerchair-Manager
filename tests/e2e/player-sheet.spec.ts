import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (J1): one sheet in a window (« Agrandir » gives the page and its
 * address), no « Âge minimum » filter, the current situation of former
 * players, and « Décédé » set with care.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("single sheet in a window, former players' situation, in memoriam", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `j1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "J1 president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('J1 fédération','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('J1 club','club',$1) RETURNING id", [federation])).rows[0].id;
    const other = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club Voisin','club',$1) RETURNING id", [federation])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const otherSeason = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [other])).rows[0].id;
    const lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const file = async (org: string, name: string, extra = "") =>
      (
        await db.query(
          `WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,former_roles,status,departure_status) SELECT $1,p.id,$2,'2006-05-04','{player}',${extra || "'{}'::text[],'active',NULL"} FROM p RETURNING id,person_id`,
          [org, name],
        )
      ).rows[0] as { id: string; person_id: string };
    const zoe = await file(club, "Zoé Présente");
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, lions, zoe.id]);
    const max = await file(club, "Max Parti", "'{player}'::text[],'active','moved'");
    // Max now plays at Club Voisin, licensed this season.
    const there = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,'Max Parti','2006-05-04') RETURNING id", [other, max.person_id])).rows[0].id;
    const aigles = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [other, otherSeason])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-5)", [other, aigles, there]);
    await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,'2026-27','CV-12','active',$4)", [federation, other, there, user]);
    await file(club, "Inès Arrêt", "'{player}'::text[],'active','stopped'");
    const tom = await file(club, "Tom Souvenir");
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. No « Âge minimum » in the search bars.
    await page.goto("/fr/players");
    await expect(page.getByRole("row").filter({ hasText: "Zoé Présente" })).toBeVisible();
    await expect(page.getByLabel("Âge minimum")).toHaveCount(0);
    await page.goto("/fr/club/manage");
    await expect(page.getByLabel("Âge minimum")).toHaveCount(0);

    // 2. A click on the name opens the single sheet in a window; « Agrandir » gives its page and address.
    await page.goto("/fr/players");
    await expect(page.getByRole("link", { name: /Fiche complète/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Zoé Présente" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Zoé Présente" });
    await expect(sheet.getByRole("tab", { name: "Vue sportive" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Agrandir la fiche de Zoé Présente en pleine page" })).toBeVisible();
    await axe(page, "sheet");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Voir la fiche de Zoé Présente" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Agrandir la fiche de Zoé Présente en pleine page" }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/players/${zoe.id}$`));
    await expect(page.getByRole("heading", { name: "Zoé Présente", level: 1 })).toBeVisible();

    // 3. « Décédé » from the departure window: confirmed, archived « In memoriam ».
    await page.goto("/fr/players");
    await page.getByRole("row").filter({ hasText: "Tom Souvenir" }).getByRole("button", { name: "Vers les anciens joueurs" }).click();
    const leaving = page.getByRole("dialog");
    await leaving.getByRole("radio", { name: "Décédé" }).check();
    await expect(leaving).toContainText("In memoriam");
    await expect(leaving.getByRole("button", { name: "Enregistrer le départ" })).toBeDisabled();
    await axe(page, "departure");
    await leaving.getByRole("checkbox", { name: "Je confirme le décès de Tom Souvenir" }).check();
    await leaving.getByRole("button", { name: "Enregistrer le départ" }).click();
    await expect.poll(async () => (await db.query("SELECT status,departure_status FROM club_person WHERE id=$1", [tom.id])).rows[0]).toEqual({ status: "archived", departure_status: "deceased" });

    // 4. Former players: « Situation actuelle ».
    await page.goto("/fr/players/former");
    await expect(page.getByRole("columnheader", { name: /Situation actuelle/ })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Max Parti" })).toContainText("Joue à Club Voisin, Aigles");
    await expect(page.getByRole("row").filter({ hasText: "Inès Arrêt" })).toContainText("A arrêté de jouer");
    await expect(page.getByRole("row").filter({ hasText: "Tom Souvenir" })).toContainText("In memoriam");
    await axe(page, "former");
    await page.screenshot({ path: "test-results/former-players.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Voir la fiche de Inès Arrêt" }).click();
    await expect(page.getByRole("dialog", { name: "Inès Arrêt" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "sheet 390");
    await page.screenshot({ path: "test-results/player-sheet-390.png" });
  } finally {
    await db.end();
  }
});
