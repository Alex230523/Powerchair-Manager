import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 40 on a phone (390 px): the presidency opens a player's sheet on « Vue
 * d'ensemble », reads what blocks him (licence, broken chair), and « Voir »
 * leads to the detailed tab. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("a person's overview", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `overview-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Paule Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club Vue','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const player = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,'Léon Vue','2012-01-01','{player}' FROM p RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, player]);
    const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status) VALUES($1,'Strike rouge','out_of_service') RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [club, chair, player, user]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/fr/players/${player}`);
    await expect(page.getByRole("tab", { name: "Vue d'ensemble" })).toHaveAttribute("aria-selected", "true");
    const blocking = page.locator(".overview-blocking");
    await expect(blocking).toContainText("Licence manquante");
    await expect(blocking).toContainText("fauteuil Strike rouge indisponible");
    await expect(page.getByRole("heading", { name: "Fauteuil" })).toBeVisible();
    await axe(page, "overview");
    await noSideScroll(page);
    await page.getByRole("button", { name: "Voir : Équipes" }).click();
    await expect(page.getByRole("tab", { name: "Vue sportive" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: "test-results/person-overview-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
