import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 16 (S2): the « Jeu » tab. Tiles, the record per team with its form
 * in letters, goals per match, top scorers with a link to the player, playing
 * time, the competition switch, the team of the top bar; axe, 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("statistics, Game tab: record, form, goals, scorers, minutes, competitions", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `game-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Game president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Game club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+230) RETURNING id", [club])).rows[0].id;
    const lions = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [club, season])).rows[0].id;
    const eagles = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Aigles','amber') RETURNING id", [club, season])).rows[0].id;
    const ana = (
      await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,p.id,'Ana Martin','{player}' FROM p RETURNING id", [club])
    ).rows[0].id;
    const match = async (team: string, days: number, our: number, their: number, kind = "league", status = "played") =>
      (
        await db.query(
          "INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Gand',$3,now()-($4::int||' days')::interval,$5,$6,$7,$8) RETURNING id",
          [club, team, kind, days, status, status === "played" ? our : null, status === "played" ? their : null, user],
        )
      ).rows[0].id as string;
    const m1 = await match(lions, 30, 3, 1);
    await match(lions, 20, 1, 1, "cup");
    await match(lions, 10, 0, 2);
    await match(eagles, 5, 2, 0, "friendly");
    await match(lions, 3, 0, 0, "league", "cancelled");
    await db.query("INSERT INTO match_player(match_id,organization_id,profile_id,starter,minutes,goals,assists) VALUES($1,$2,$3,true,40,2,1)", [m1, club, ana]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. From the Club tab to the Game tab.
    await page.goto("/fr/statistics/club");
    await page.getByRole("navigation", { name: "Onglets des statistiques" }).getByRole("link", { name: "Jeu" }).click();
    await expect(page).toHaveURL(/\/fr\/statistics\/game/);
    await expect(page.getByRole("link", { name: "Jeu" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".stat-card").filter({ hasText: "Matchs joués" })).toContainText("4");
    await expect(page.locator(".stat-card").filter({ hasText: "Victoires" })).toContainText("50 % des matchs");
    await expect(page.locator(".stat-card").filter({ hasText: "Différence de buts" })).toContainText("+2");

    // 2. Record per team: the form in letters, the colour never alone.
    const teams = page.locator("#stats-teams");
    const row = teams.getByRole("row").filter({ hasText: "Lions" });
    await expect(row).toContainText("V");
    await expect(row.getByRole("img", { name: "Les 3 derniers résultats, du plus ancien au plus récent : victoire, nul, défaite" })).toBeVisible();
    await expect(row.locator(".form-pill")).toHaveText(["V", "N", "D"]);
    await teams.getByRole("button", { name: /^Buts pour/ }).click();
    await expect(page).toHaveURL(/sort-teams=/);
    await axe(page, "game tab");

    // 3. Goals per match: four bars above the axis, the cancelled match left out.
    const goals = page.locator("#stats-goals");
    await expect(goals.getByRole("group", { name: /^Buts par match/ })).toBeVisible();
    await expect(goals.locator("svg rect[rx]")).toHaveCount(6);

    // 4. Top scorer, with a link to the player's sheet; playing time with the starts.
    const scorers = page.locator("#stats-scorers");
    await expect(scorers.getByRole("link", { name: "Ana Martin" })).toHaveAttribute("href", `/fr/players/${ana}`);
    await expect(scorers.getByRole("row").filter({ hasText: "Ana Martin" })).toContainText("2");
    await expect(page.locator("#stats-minutes").getByRole("img", { name: /Ana Martin 40 min · 1 titularisation/ })).toBeVisible();

    // 5. By competition.
    const competitions = page.locator("#stats-competitions");
    await competitions.getByRole("group", { name: "Compétition" }).getByRole("button", { name: "Coupe" }).click();
    await expect(competitions.locator("dl")).toContainText("1");
    await competitions.getByRole("group", { name: "Compétition" }).getByRole("button", { name: "Tournoi" }).click();
    await expect(competitions).toContainText("Aucun match de ce type sur cette période.");

    // 6. The team of the top bar: only the Lions.
    await page.goto(`/fr/statistics/game?season=${season}&team=${lions}`);
    await expect(page.locator(".page-subtitle")).toHaveText("Saison 2026-27 · Lions");
    await expect(page.locator(".stat-card").filter({ hasText: "Matchs joués" })).toContainText("3");
    await expect(page.locator("#stats-teams").getByRole("row").filter({ hasText: "Aigles" })).toHaveCount(0);

    // 7. Dark theme and 390 px.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/fr/statistics/game");
    await expect(page.locator("#stats-goals .chart")).toBeVisible();
    await axe(page, "game dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/fr/statistics/game");
    await expect(page.locator("#stats-teams")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await axe(page, "game 390");
  } finally {
    await db.end();
  }
});
