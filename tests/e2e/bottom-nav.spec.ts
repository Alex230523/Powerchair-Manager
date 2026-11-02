import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C5): the bar at the bottom of a phone screen, for the president,
 * the coach, the player and the parent: its entries, the current page, the
 * counter, "Plus" opening the menu, the bar stepping aside while typing, axe.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("bottom bar on a phone for each role", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `bottom-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Bottom tester", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Bottom club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandates: Record<string, string> = {};
    for (const [role, grants] of [
      ["club_president", []],
      ["coach", ["attendance.manage", "people.read"]],
      ["player", []],
      ["guardian", []],
    ] as const)
      mandates[role] = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [club, user, role, grants])).rows[0].id;
    const expected: Record<string, string[]> = {
      club_president: ["Accueil", "Calendrier", "Joueurs", "Cotisations", "Plus"],
      coach: ["Accueil", "Calendrier", "Présences", "Joueurs", "Plus"],
      player: ["Accueil", "Calendrier", "Ma fiche", "Cotisations", "Plus"],
      guardian: ["Accueil", "Ma famille", "Calendrier", "Cotisations", "Plus"],
    };
    for (const role of Object.keys(expected)) {
      // The profile is switched on a wide screen (the account menu sits in the sidebar), then the phone.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/fr");
      await page.locator(".profile-menu > summary").click();
      await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandates[role])]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/fr");
      const bar = page.getByRole("navigation", { name: "Navigation rapide" });
      await expect(bar).toBeVisible();
      const entries = bar.locator("a, button");
      await expect(entries).toHaveCount(5);
      expect((await entries.allInnerTexts()).map((x) => x.trim().split("\n")[0])).toEqual(expected[role]);
      await expect(bar.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
      // Targets of 48 px at least; the bar stays inside the screen.
      for (const box of await entries.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON())))
        expect(Math.min(box.width, box.height), role).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await axe(page, `bottom bar ${role}`);
      // "Plus" opens the whole menu.
      await bar.getByRole("button", { name: "Plus" }).click();
      await expect(page.locator(".sidebar[data-open]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".sidebar[data-open]")).toHaveCount(0);
      // The second entry leads to the calendar and becomes the current page.
      await bar.getByRole("link", { name: "Calendrier" }).click();
      await expect(page).toHaveURL(/\/fr\/calendar/);
      await expect(page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("link", { name: "Calendrier" })).toHaveAttribute("aria-current", "page");
    }
    // While typing in a field, the bar steps aside for the keyboard.
    await page.goto("/fr/settings/account");
    await expect(page.getByRole("navigation", { name: "Navigation rapide" })).toBeVisible();
    await page.locator("main select").first().focus();
    await expect(page.getByRole("navigation", { name: "Navigation rapide" })).toBeHidden();
    // Wide screens keep the sidebar only.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("navigation", { name: "Navigation rapide" })).toBeHidden();
  } finally {
    await db.end();
  }
});
