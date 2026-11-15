import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 14: the white sidebar and its account menu, the quiet top bar with the
 * search field, the season capsule and the bell, and the mobile drawer.
 */
/** With `within`, only that part of the page is analysed (an open popover covers the buttons beneath it, which is not a defect of theirs). */
async function axe(page: Page, label: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  const violations = (await (within ? builder.include(within) : builder).analyze()).violations.map(
    (v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(violations, label).toEqual([]);
}

test("sidebar, account menu, search, bell and mobile drawer", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `shell-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Shell test president", email, "Browser-test-passphrase-2026!");
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
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Shell club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);

    // Desktop: brand, club name, regrouped menu, search field and the shortcut.
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    const sidebar = page.getByRole("complementary", { name: "Menu principal" });
    await expect(sidebar.locator(".brand-name")).toHaveText("Powerchair Manager");
    await expect(sidebar.locator(".brand-org")).toHaveText("Shell club");
    // Wide screen: the drawer buttons stay hidden.
    await expect(page.getByRole("button", { name: "Ouvrir le menu", exact: true })).toBeHidden();
    await expect(sidebar.getByRole("button", { name: "Fermer le menu", exact: true })).toBeHidden();
    // 13/11/2026: the groups in the order of the day.
    for (const name of ["Agenda", "Sport", "Personnes", "Communication", "Finances", "Club"]) await expect(sidebar.locator("nav summary").filter({ hasText: name }).first()).toBeVisible();
    // 12: no « Plus »; « Réglages » is the last entry of the menu.
    await expect(sidebar.locator("nav summary").filter({ hasText: "Plus" })).toHaveCount(0);
    await expect(sidebar.locator("nav .nav-settings").getByRole("link", { name: "Réglages", exact: true })).toBeVisible();
    await expect(sidebar.locator("nav").getByRole("link", { name: "Mon espace", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator("header select")).toHaveCount(1);
    await expect(page.getByRole("banner").getByLabel("Saison", { exact: true })).toBeVisible();
    const search = page.getByRole("banner").getByRole("button", { name: /Rechercher un joueur/ });
    await expect(search).toBeVisible();
    await expect(search.locator("kbd")).toHaveText(/Ctrl K|⌘K/);
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: /Rechercher un joueur/ });
    await expect(box).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
    await search.click();
    await expect(box).toBeFocused();
    await page.keyboard.press("Escape");
    await axe(page, "desktop home");

    // The bell: a test notification shows up as one unread, in a panel that Escape closes.
    const bellButton = page.getByRole("banner").getByRole("button", { name: /^Notifications/ });
    await expect(bellButton).toHaveAccessibleName(/Aucune notification non lue/);
    await page.goto("/fr/notifications");
    await page.getByRole("button", { name: "Tester mes notifications", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Test de notification/, level: 3 })).toBeVisible();
    await page.goto("/fr");
    await expect(bellButton).toHaveAccessibleName(/1 notification non lue/);
    await expect(bellButton.locator(".bell-count")).toHaveText("1");
    await bellButton.click();
    const panel = page.getByRole("dialog", { name: "Notifications" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/^Test de notification/)).toBeVisible();
    await expect(panel.getByRole("link", { name: /Tout voir/ })).toHaveAttribute("href", "/fr/settings/notifications");
    await axe(page, "bell panel", ".bell-panel");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(bellButton).toBeFocused();

    // The account menu (wave 16, M1): profile switch, Mon compte, Réglages, then compact settings.
    await page.locator(".profile-menu > summary").click();
    const menu = page.locator(".profile-menu-body");
    await expect(menu.getByText("Changer de profil")).toBeVisible();
    await expect(menu.getByLabel("Profil actif", { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Mon espace", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Mon compte", exact: true })).toHaveAttribute("href", "/fr/settings/account");
    await expect(menu.getByRole("link", { name: "Réglages", exact: true })).toHaveAttribute("href", "/fr/settings");
    // Never wider than the sidebar.
    expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(240);
    await expect(menu.getByLabel("Langue", { exact: true })).toHaveValue("fr");
    await menu.getByRole("group", { name: "Thème" }).getByRole("button", { name: "Thème sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await axe(page, "account menu, dark");
    await menu.getByRole("group", { name: "Thème" }).getByRole("button", { name: "Thème clair" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // The language list opens the same page in Dutch.
    await Promise.all([page.waitForURL(/\/nl$/), menu.getByRole("combobox", { name: "Langue", exact: true }).selectOption("nl")]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await expect(menu.getByRole("button", { name: "Se déconnecter", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    // Mobile: the sidebar is a drawer; Escape, the backdrop and a navigation close it; focus comes back to the button.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    const open = page.getByRole("button", { name: "Ouvrir le menu", exact: true });
    await expect(open).toBeVisible();
    await expect(sidebar).toBeHidden();
    await open.click();
    await expect(sidebar).toBeVisible();
    const close = sidebar.getByRole("button", { name: "Fermer le menu", exact: true });
    await expect(close).toBeFocused();
    await axe(page, "drawer open");
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await page.locator(".drawer-backdrop").click({ position: { x: 380, y: 400 } });
    await expect(sidebar).toBeHidden();
    await open.click();
    // 13/11/2026: « Joueurs » is under « Personnes ».
    await sidebar.locator("nav summary").filter({ hasText: "Personnes" }).click();
    await sidebar.getByRole("link", { name: "Joueurs", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/players$/);
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("banner").getByLabel("Saison", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await axe(page, "mobile players");
  } finally {
    await db.end();
  }
});
