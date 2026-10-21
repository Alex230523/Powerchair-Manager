import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (C4): text size and stronger contrast. Chosen in the account
 * menu, applied at once and before paint on the next page; in "Très grand"
 * the dashboard and the player page fit at 1280 and 390 px; axe passes with
 * the stronger contrast.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("display: very large text and stronger contrast", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `display-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Display president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Display club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const player = (
      await db.query(
        "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Maximilien Vandenberghe-Dupont','2010-01-01','{player}' FROM p RETURNING id",
        [club],
      )
    ).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')", [club, team, player]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The choice in the account menu applies at once.
    await page.goto("/fr");
    const base = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(base).toBe(14);
    await page.locator(".profile-menu > summary").click();
    await page.getByRole("group", { name: "Taille du texte" }).getByRole("button", { name: "Très grand" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "xlarge");
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBe(17.5);
    await page.getByRole("checkbox", { name: "Contraste renforcé" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "more");

    // 2. Kept on this device and applied before paint on the next page.
    await page.reload();
    expect(await page.evaluate(() => [document.documentElement.dataset.textSize, document.documentElement.dataset.contrast])).toEqual(["xlarge", "more"]);
    await page.keyboard.press("Escape");

    // 3. Very large text: the dashboard and the player page fit at 1280 and 390 px.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/fr", `/fr/players/${player}`]) {
        await page.goto(path);
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(await overflow(page), `${path} at ${width}`).toBeLessThanOrEqual(1);
        // The main heading never runs under the sidebar or out of the screen.
        const h1 = (await page.locator("main h1").first().boundingBox())!;
        expect(h1.x).toBeGreaterThanOrEqual(0);
        expect(h1.x + h1.width).toBeLessThanOrEqual(width + 1);
      }
    }

    // 4. Stronger contrast: grey texts as dark as the text, axe passes.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fr");
    const [muted, text] = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return [s.getPropertyValue("--muted").trim(), s.getPropertyValue("--text").trim()];
    });
    expect(muted).toBe(text);
    await axe(page, "dashboard, stronger contrast, very large text");
    await page.goto(`/fr/players/${player}`);
    await axe(page, "player page, stronger contrast, very large text");
  } finally {
    await db.end();
  }
});
