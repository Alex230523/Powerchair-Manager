import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C13): the settings home with one card per category and a search,
 * the category sub-pages, the old addresses redirected, the unsaved-changes
 * guard, categories hidden without the right, and the phone layout.
 */
async function axe(page: Page, label: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map(
    (v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(violations, label).toEqual([]);
}

test("settings home, search, sub-pages, old addresses, unsaved changes and rights", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `settings-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Settings test president", email, "Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Settings club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const president = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    // The same person also holds a coach mandate without any right, to see what a coach gets.
    const coach = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,'coach','{}') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(president)]);

    // The home: seven category cards, three per row on a wide screen.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fr/settings");
    await expect(page.getByRole("heading", { name: "Réglages", level: 1 })).toBeVisible();
    const cards = page.locator(".settings-grid > li");
    await expect(cards).toHaveCount(7);
    for (const name of ["Mon compte", "Notifications et résumé", "Club", "Membres et droits", "Activités", "Finances", "Journaux et confidentialité"])
      await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    await axe(page, "settings home");

    // The search: accents do not matter, Enter opens the sub-page at the setting.
    const search = page.getByLabel("Rechercher un réglage", { exact: true });
    await search.fill("bareme");
    await expect(page.getByRole("list", { name: "Réglages trouvés" }).getByRole("link")).toHaveCount(1);
    await search.fill("zzz");
    await expect(page.getByText("Aucun réglage ne correspond à cette recherche.")).toBeVisible();
    await search.fill("seuils");
    await search.press("Enter");
    await expect(page).toHaveURL("/fr/settings/activities#settings-presence");
    await expect(page.getByRole("heading", { name: "Activités", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Fil d’Ariane" }).getByRole("link", { name: "Réglages" })).toHaveAttribute("href", "/fr/settings");
    const nav = page.getByRole("navigation", { name: "Catégories de réglages" });
    await expect(nav.getByRole("link", { name: "Activités" })).toHaveAttribute("aria-current", "page");
    await axe(page, "settings activities");

    // Unsaved changes: leaving asks first; staying keeps the page, leaving drops the change.
    const ok = page.getByLabel("Entraînements · Joueurs · Suffisant à partir de", { exact: true });
    await ok.fill("4");
    await nav.getByRole("link", { name: "Finances" }).click();
    const warn = page.getByRole("dialog", { name: "Changements non enregistrés" });
    await expect(warn).toBeVisible();
    await warn.getByRole("button", { name: "Rester sur la page", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/settings\/activities/);
    await expect(ok).toHaveValue("4");
    await nav.getByRole("link", { name: "Finances" }).click();
    await page.getByRole("dialog", { name: "Changements non enregistrés" }).getByRole("button", { name: "Quitter sans enregistrer", exact: true }).click();
    await expect(page).toHaveURL("/fr/settings/money");
    await expect(page.getByRole("heading", { name: "Cotisations", exact: true }).first()).toBeVisible();
    // Saved changes leave without a question.
    await nav.getByRole("link", { name: "Activités" }).click();
    await page.getByLabel("Entraînements · Joueurs · Suffisant à partir de", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Enregistrer les seuils", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Seuils enregistrés." })).toBeVisible();
    await nav.getByRole("link", { name: "Club" }).click();
    await expect(page).toHaveURL("/fr/settings/club");
    await expect(page.getByRole("heading", { name: "Identité du club", exact: true })).toBeVisible();
    await axe(page, "settings club");

    // Every category passes axe.
    for (const c of ["account", "notifications", "members", "money", "journals"]) {
      await page.goto(`/fr/settings/${c}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText(/^Chargement/)).toHaveCount(0, { timeout: 15000 });
      await axe(page, `settings ${c}`);
    }

    // Old addresses: the single page's anchors and the notifications page land on the right sub-page.
    await page.goto("/fr/settings#settings-dues-title");
    await expect(page).toHaveURL("/fr/settings/money#settings-dues-title");
    await page.goto("/fr/notifications");
    await expect(page).toHaveURL("/fr/settings/notifications");
    await expect(page.getByRole("button", { name: "Tester mes notifications", exact: true })).toBeVisible();
    // 12: « Gestion du club » and « Données personnelles » are categories of Réglages.
    await page.goto("/fr/club/manage");
    await expect(page).toHaveURL("/fr/settings/club");
    await page.goto("/fr/privacy");
    await expect(page).toHaveURL("/fr/settings/data");
    await expect(page.getByRole("heading", { name: "Mes données", exact: true })).toBeVisible();
    // Ctrl+K finds a setting.
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: /Rechercher un joueur/ }).fill("Barèmes");
    await page.getByRole("option", { name: /Barèmes de cotisation · Réglages/ }).click();
    await expect(page).toHaveURL("/fr/settings/money#settings-dues-title");

    // Phone: the home is the list of categories, a sub-page has a back link and no side column.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/settings");
    await expect(cards).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.locator("main").getByRole("link", { name: /^Finances/ }).click();
    await expect(page).toHaveURL("/fr/settings/money");
    await expect(page.getByRole("navigation", { name: "Catégories de réglages" })).toBeHidden();
    const back = page.locator("main").getByRole("link", { name: "Tous les réglages", exact: true });
    await expect(back).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await axe(page, "settings money 390");
    await back.click();
    await expect(page).toHaveURL("/fr/settings");

    // A coach without rights sees only their account and notifications; other categories say so.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(coach)]);
    await page.goto("/fr/settings");
    await expect(cards).toHaveCount(2);
    await page.getByLabel("Rechercher un réglage", { exact: true }).fill("barème");
    await expect(page.getByText("Aucun réglage ne correspond à cette recherche.")).toBeVisible();
    await page.goto("/fr/settings/money");
    await expect(page.getByText("Cette catégorie n’est pas disponible pour votre profil.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cotisations", exact: true })).toHaveCount(0);
    await axe(page, "coach settings money");
  } finally {
    await db.end();
  }
});
