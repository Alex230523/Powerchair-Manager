import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 12/11/2026, the « Fédération » page of a club, on the real server and a
 * phone (390 px). The menu offers « Fédération » (no more « Circulaires » nor
 * « Discipline ») and no team capsule in the top bar; the page shows the
 * circular received, the federation's tournament, the club's discipline and
 * the card of each affiliated club, with its president, its founding year,
 * its home hall and its title. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a club's federation page: circulars, tournaments, discipline and the affiliated clubs", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `fedpage-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Fanny Fédé", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'federation') RETURNING id", [`Ligue ${stamp}`])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id,city) VALUES($1,'club',$2,'Namur') RETURNING id", [`Club Fanny ${stamp}`, fed])).rows[0].id;
    const other = (await db.query("INSERT INTO organization(name,kind,federation_id,city,founded_year) VALUES($1,'club',$2,'Liège',1998) RETURNING id", [`Club voisin ${stamp}`, fed])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO calendar_place(organization_id,name,home) VALUES($1,'Hall du Parc',true)", [other]);
    await db.query("INSERT INTO award(organization_id,awarded_on,title,kind,place,publishable,created_by) VALUES($1,'2025-06-01','Coupe de printemps','team',1,true,$2)", [other, user]);
    const circular = (await db.query("INSERT INTO circular(federation_id,title,body,audiences,status,sent_at,created_by) VALUES($1,'Calendrier de la saison','Texte','{presidents}','sent',now(),$2) RETURNING id", [fed, user])).rows[0].id;
    await db.query("INSERT INTO circular_recipient(circular_id,user_id,organization_id) VALUES($1,$2,$3)", [circular, user, club]);
    const tournament = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe de la ligue',2026,'league') RETURNING id", [fed])).rows[0].id;
    await db.query("INSERT INTO tournament_day(tournament_id,day,venue) VALUES($1,CURRENT_DATE+10,'Salle Une')", [tournament]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // The menu: « Fédération », and neither « Circulaires » nor « Discipline »; the top bar has no team.
    await page.goto("/fr/club/federation");
    await expect(page.locator(".scope-bar").getByRole("combobox", { name: "Équipe", exact: true })).toHaveCount(0);
    await expect(page.locator('nav a[href="/fr/club/federation"]').first()).toHaveCount(1);
    await expect(page.locator('nav a[href="/fr/circulars"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="/fr/discipline"]')).toHaveCount(0);

    await expect(page.getByRole("heading", { level: 1, name: `Ligue ${stamp}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Calendrier de la saison" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Coupe de la ligue" })).toBeVisible();
    await expect(page.getByText(/Salle Une/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Discipline du club" })).toBeVisible();
    const card = page.locator(".federation-club").filter({ hasText: `Club voisin ${stamp}` });
    await expect(card).toContainText("Créé en 1998");
    await expect(card).toContainText("Hall du Parc");
    await expect(card).toContainText("1 titre(s)");
    await expect(card).toContainText("Coupe de printemps 2025");
    await expect(page.locator(".federation-club").filter({ hasText: `Club Fanny ${stamp}` })).toContainText("Votre club");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await axe(page, "federation page");
  } finally {
    await db.end();
  }
});
