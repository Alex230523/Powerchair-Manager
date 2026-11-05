import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 5 at 1440 and 390 px: one match line with its result pill read in words,
 * a friendly marked as such, the team card leading to the team's game
 * statistics, one tab per team there. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the matches page and the team statistics", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `matches5-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Max Match", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Matchs','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison matchs',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const lions = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [club, season])).rows[0].id as string;
    await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Aigles','amber')", [club, season]);
    await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,competition,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Gand','league','D1',now()-interval '5 days','played',3,1,$3)", [club, lions, user]);
    await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,created_by) VALUES($1,$2,'Namur','friendly',now()+interval '5 days','scheduled',$3)", [club, lions, user]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/fr/matches");
      await page.getByLabel("Afficher").selectOption("all");
      const played = page.locator(".match-list > li").filter({ hasText: "Gand" });
      // 04/11/2026: the score itself, green when won, says the result.
      await expect(played.locator('.match-score[data-outcome="win"]')).toHaveText("3-1Victoire 3 à 1");
      await expect(page.locator(".match-list > li").filter({ hasText: "Namur" })).toContainText("Match amical");
      await axe(page, `matches ${width}`);
      await noSideScroll(page);
      await page.screenshot({ path: `test-results/matches-${width}.png`, fullPage: true });
    }
    await page.getByRole("link", { name: /^Lions/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/fr/statistics/game\\?team=${lions}`));
    await expect(page.getByRole("navigation", { name: "Équipes" }).getByRole("link", { name: "Lions" })).toHaveAttribute("aria-current", "page");
    await axe(page, "team statistics");
    await noSideScroll(page);
  } finally {
    await db.end();
  }
});
