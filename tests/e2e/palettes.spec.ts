import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Prompt 2.9: the club's palette. Chosen in Settings > Club with a live
 * preview, saved and set by the server before the first paint (also on a
 * public page of the club); then the main pages in the four palettes, light
 * and dark, at 1440 and 390 px: no overflow, axe clean, a screenshot each
 * (test-results/palettes, in the CI artifact).
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("club palettes: choice, first paint, public page, every main page in both themes", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(900000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `palette-club-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Palette president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Palette club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [club, season])).rows[0].id;
    const player = (
      await db.query(
        "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Lou Palette','2011-03-01','{player}' FROM p RETURNING id",
        [club],
      )
    ).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')", [club, team, player]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Settings > Club: live preview, then saved.
    await page.goto("/fr/settings/club");
    const card = page.getByRole("region", { name: "Apparence" });
    await card.getByRole("radio", { name: "Bordeaux" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "bordeaux");
    await card.getByRole("group", { name: "Teinte du fond" }).getByRole("button", { name: "Marquée" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tint", "strong");
    await axe(page, "appearance card");
    await card.getByRole("button", { name: "Enregistrer" }).click();
    await expect(card.getByRole("status")).toHaveText("Apparence enregistrée.");
    expect((await db.query("SELECT theme_palette,theme_tint FROM organization WHERE id=$1", [club])).rows[0]).toEqual({ theme_palette: "bordeaux", theme_tint: "strong" });

    // 2. The server sets it before the first paint, and the browser bar follows the primary.
    const html = await (await page.request.get("/fr")).text();
    expect(html).toMatch(/<html[^>]*data-palette="bordeaux"/);
    expect(html).toMatch(/<meta name="theme-color"[^>]*content="#592b41"/);

    // 3. A public page of the club takes its palette too.
    const token = ("pot" + Date.now().toString(36)).padEnd(24, "x");
    const group = (await db.query("INSERT INTO fundraising_group(organization_id,name,created_by) VALUES($1,'Fauteuils',$2) RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO fundraising_pot(organization_id,group_id,name,description,goal_cents,status,public_token,created_by) VALUES($1,$2,'Nouveaux fauteuils','',100000,'open',$3,$4)", [club, group, token, user]);
    await page.goto(`/fr/cagnotte/${token}`);
    await expect(page.locator("html")).toHaveAttribute("data-palette", "bordeaux");

    // 4. Every main page, four palettes, light and dark, 1440 and 390 px.
    for (const palette of ["night", "bordeaux", "aubergine", "brown"]) {
      await db.query("UPDATE organization SET theme_palette=$2,theme_tint='light' WHERE id=$1", [club, palette]);
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          for (const [name, path] of [
            ["home", "/fr"],
            ["players", "/fr/players"],
            ["player", `/fr/players/${player}`],
            ["calendar", "/fr/calendar"],
            ["settings", "/fr/settings/club"],
          ]) {
            await page.goto(path);
            await expect(page.locator("main h1").first()).toBeVisible();
            if (palette === "night") await expect(page.locator("html")).not.toHaveAttribute("data-palette", /.+/);
            else await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${palette} ${scheme} ${width} ${name}`).toBeLessThanOrEqual(1);
            if (width === 1440) await axe(page, `${palette} ${scheme} ${name}`);
            await page.screenshot({ path: `test-results/palettes/${palette}-${scheme}-${width}-${name}.png`, fullPage: true });
          }
        }
      }
    }
  } finally {
    await db.end();
  }
});
