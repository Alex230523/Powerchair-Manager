import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (A): the president's home: fixed squares, club status, layout. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("president's home: squares turn green, club status, two columns at 900 px", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `home-${Date.now()}@example.test`;
  const year = new Date().getFullYear();
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Home president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Home club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // 1. The form of the club proposes its obligations (Settings > Club).
    await page.goto("/fr/settings/club");
    await page.getByLabel("Forme du club").selectOption("asbl");
    await page.locator("form").filter({ has: page.locator("#club-legal-form") }).getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Enregistré.").first()).toBeVisible();
    const panel = page.locator(".obligations-card");
    await page.reload();
    await expect(panel.getByRole("row").filter({ hasText: "Assemblée générale tenue" })).toBeVisible();
    await expect(panel.getByRole("row")).toHaveCount(10);
    await axe(page, "obligations");

    // 2. Four of seven done: « 4 sur 7 » on the home square.
    await db.query("UPDATE club_obligation SET archived=true WHERE organization_id=$1 AND template_key IN ('board','members')", [club]);
    await db.query("UPDATE club_obligation SET done_on=CURRENT_DATE WHERE organization_id=$1 AND template_key IN ('federation','sportea','insurance','assembly')", [club]);
    await page.goto("/fr");
    const status = page.getByRole("link", { name: /^Statut du club/ });
    await expect(status).toContainText("4 sur 7");
    // Documents: nothing missing, the square stays, green, named « à jour ».
    await expect(page.getByRole("link", { name: "Documents : à jour" })).toBeVisible();
    await axe(page, "home");

    // 3. Everything done: the club status square turns green too.
    await db.query("UPDATE club_obligation SET done_on=CURRENT_DATE WHERE organization_id=$1 AND year=$2", [club, year]);
    await page.reload();
    await expect(page.getByRole("link", { name: "Statut du club : à jour" })).toBeVisible();

    // 4. Two columns down to 860 px: events and figures side by side at 900 px.
    await page.setViewportSize({ width: 900, height: 900 });
    const agenda = await page.locator(".dash-agenda").boundingBox();
    const side = await page.locator(".dash-side").boundingBox();
    expect(agenda && side && Math.abs(agenda.y - side.y) < 4 && side.x > agenda.x).toBe(true);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await axe(page, "home 390");
  } finally {
    await db.end();
  }
});
