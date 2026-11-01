import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C6): Ctrl+K becomes a shortcut to act. Actions first, by right;
 * keyboard navigation; an action opens its form; a player found offers to
 * collect their fee; the last items opened come back; axe.
 */
test("command window: actions, keyboard, rights, recent items", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `palette-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Palette president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Palette club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const president = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const coach = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,'coach','{people.read}') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions')", [club, season]);
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Noa Palette','2011-01-01','{player}' FROM p",
      [club],
    );
    const switchTo = async (mandate: string) => {
      await page.goto("/fr");
      await page.locator(".profile-menu > summary").click();
      await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    };
    await page.setViewportSize({ width: 1280, height: 900 });
    await switchTo(president);
    await page.goto("/fr");

    // 1. Empty field: the actions of the president, first section.
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: /Rechercher un joueur/ });
    await expect(box).toBeFocused();
    const palette = page.locator(".command-palette");
    const actions = palette.getByRole("group", { name: "Actions" });
    await expect(actions.getByRole("option", { name: /Créer un événement/ })).toBeVisible();
    await expect(actions.getByRole("option", { name: /Importer des joueurs/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).include(".command-palette").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => v.id)).toEqual([]);

    // 2. Keyboard: the arrows move the choice, the active one shows "Entrée".
    const selected = palette.locator('[role="option"][aria-selected="true"]');
    const first = await selected.innerText();
    await page.keyboard.press("ArrowDown");
    expect(await selected.innerText()).not.toBe(first);
    await expect(selected.locator(".command-enter")).toHaveText("Entrée");
    await page.keyboard.press("ArrowUp");
    expect(await selected.innerText()).toBe(first);

    // 3. Typing narrows the actions; Enter opens the import window directly.
    await box.fill("importer");
    await expect(palette.getByRole("group", { name: "Actions" }).getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fr\/players\?import=1$/);
    await expect(page.getByRole("dialog", { name: /Importer des joueurs/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // 4. A player found: their profile, and their fee to collect.
    await page.keyboard.press("Control+k");
    await box.fill("Noa Pal");
    await expect(palette.getByRole("group", { name: "Personnes" }).getByRole("option", { name: /^Noa Palette/ })).toBeVisible();
    await expect(palette.getByRole("option", { name: /Encaisser la cotisation de Noa Palette/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // 5. The last item opened comes back when the field is empty.
    await page.keyboard.press("Control+k");
    await expect(palette.getByRole("group", { name: "Récents" }).getByRole("option", { name: /Importer des joueurs/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // 6. A coach without the calendar right sees no "Créer un événement".
    await switchTo(coach);
    await page.goto("/fr");
    await page.keyboard.press("Control+k");
    await expect(palette.getByRole("option", { name: /Créer un événement/ })).toHaveCount(0);
    await expect(palette.getByRole("option", { name: /Encaisser/ })).toHaveCount(0);
  } finally {
    await db.end();
  }
});
