import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 20 on a phone (390 px): « Nouveautés » filtered on the coach's role (the
 * federation's news only with « Voir aussi »), read once opened; the home's
 * window, when there is one, shown once. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("what's new, by role", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `news-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Noé Nouveau", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Nouveautés','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach') RETURNING id", [club, user])).rows[0].id as string;
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // The home's window, if a delivery is still fresh: closed once, gone for good.
    await page.goto("/fr");
    const popup = page.locator(".news-popup");
    if (await popup.isVisible({ timeout: 5000 }).catch(() => false)) {
      const title = (await popup.locator("h2").textContent()) ?? "";
      await axe(page, "home window");
      await popup.getByRole("button", { name: "Fermer" }).click();
      await expect(popup).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
      await expect(page.locator(".news-popup h2").filter({ hasText: title })).toHaveCount(0);
    }

    await page.goto("/fr/nouveautes");
    await expect(page.getByRole("heading", { name: "Nouveautés", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Une bibliothèque d'exercices" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "L'espace de la fédération" })).toHaveCount(0);
    await axe(page, "news");
    await noSideScroll(page);
    await page.getByLabel("Voir aussi les nouveautés des autres rôles").check();
    await expect(page.getByRole("heading", { name: "L'espace de la fédération" })).toBeVisible();
    // Opened, the entries are read.
    await expect.poll(async () => Number((await db.query("SELECT count(*)::int AS n FROM user_news_read WHERE user_id=$1", [user])).rows[0].n)).toBeGreaterThan(10);
    await page.screenshot({ path: "test-results/news-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
