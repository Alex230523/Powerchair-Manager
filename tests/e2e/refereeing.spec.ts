import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 25 and 36 to 39 on a phone (390 px): the federation designates a referee
 * marked unavailable (the warning shows); the referee accepts, finds the
 * route, writes the report of the match played with a goal from the team
 * sheet, and sees what his claim is worth. Axe on each state, no sideways
 * scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
const context = (page: Page, id: string) =>
  page.evaluate(async (mandateId) => {
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
  }, id);

test("refereeing: designate, accept, report, claim", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `refereeing-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Rita Sifflet", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind,referee_flat_cents,referee_km_rate_cents) VALUES('Fédération arbitrage','federation',1000,30) RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club des Aigles','club',$1) RETURNING id", [fed])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [fed, user]);
    const president = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id as string;
    const referee = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'referee') RETURNING id", [fed, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,venue,created_by) VALUES($1,$2,'Lions','league',now()+interval '3 days','Hall de Namur',$3)", [club, team, user]);
    const played = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,venue,created_by) VALUES($1,$2,'Tigres','league',now()-interval '2 hours','Hall de Gand',$3) RETURNING id", [club, team, user])).rows[0].id;
    const scorer = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Léa Buteuse' FROM p RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO match_player(match_id,organization_id,profile_id,starter,jersey_number) VALUES($1,$2,$3,true,9)", [played, club, scorer]);
    await db.query("INSERT INTO referee_assignment(match_id,federation_id,referee_id,role,status,assigned_by) VALUES($1,$2,$3,'main','accepted',$3)", [played, fed, user]);
    // Not available the day of the match to come.
    await db.query("INSERT INTO referee_availability(federation_id,user_id,day,available) VALUES($1,$2,((now()+interval '3 days') AT TIME ZONE 'Europe/Brussels')::date,false)", [fed, user]);
    await page.goto("/fr");
    await context(page, president);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/federation/referees");
    await expect(page.getByRole("heading", { name: "Couvrir les matchs" })).toBeVisible();
    const cover = page.locator(".refereeing .records > li").filter({ hasText: "Lions" });
    await expect(cover.getByText("Sans arbitre")).toBeVisible();
    await cover.getByLabel(/^Arbitre : /).selectOption({ index: 1 });
    await expect(cover.getByText("Attention, Rita Sifflet : indisponible.")).toBeVisible();
    await axe(page, "federation desk");
    await cover.getByRole("button", { name: "Désigner" }).click();
    await expect(cover.getByText("À confirmer")).toBeVisible();
    await noSideScroll(page);

    await context(page, referee);
    await page.goto("/fr/referee");
    const proposals = page.locator("section").filter({ has: page.getByRole("heading", { name: "À accepter" }) });
    await proposals.getByRole("button", { name: /^Accepter/ }).click();
    const upcoming = page.locator("section").filter({ has: page.getByRole("heading", { name: "Mes prochains matchs" }) });
    await expect(upcoming.getByRole("link", { name: /Itinéraire Google Maps/ })).toHaveAttribute("href", /Hall%20de%20Namur/);

    const report = page.getByRole("form", { name: /Envoyer le rapport/ });
    await report.getByLabel("Buts à domicile").fill("1");
    await report.getByLabel("Buts des visiteurs").fill("0");
    await report.getByLabel("Joueur de la feuille de match").selectOption({ label: "9 · Léa Buteuse" });
    await report.getByLabel("Minute").fill("12");
    await report.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(report.getByText(/But · Domicile · Léa Buteuse · 12'/)).toBeVisible();
    await axe(page, "report");
    await report.getByRole("button", { name: "Envoyer le rapport" }).click();
    await expect(page.getByText(/Rapport envoyé/)).toBeVisible();

    const claim = page.getByRole("form", { name: /Envoyer la note de frais/ });
    await claim.getByLabel("Kilomètres (aller-retour)").fill("20");
    await expect(claim.getByText(/Montant : 16,00/)).toBeVisible();
    await axe(page, "referee desk");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/refereeing-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
