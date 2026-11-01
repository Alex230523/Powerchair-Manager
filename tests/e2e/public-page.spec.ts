import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B6: the presidency publishes the club's page (390 px); an anonymous
 * visitor sees it; a widget may be framed by another site, the page may
 * not; an API key reads the teams. Axe on each step.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the club's public page, a widget and an API key", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const email = `b6-${stamp}@example.test`;
  const slug = `club-b6-${stamp}`;
  try {
    await prepareSignIn(page, db, "B6 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,city) VALUES('B6 club','club','Namur') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles')", [club, season]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Publish the page.
    await page.goto("/fr/club/public");
    await page.getByRole("checkbox", { name: "Publier la page du club" }).click();
    await page.getByLabel("Adresse de la page").fill(slug);
    await page.getByRole("textbox", { name: "Présentation", exact: true }).fill("Powerchair football à Namur.");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status").first()).toHaveText("Enregistré.");
    await expect(page.getByRole("link", { name: "Voir la page publique" })).toBeVisible();
    await axe(page, "settings");

    // 2. An anonymous visitor.
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const visitor = await guest.newPage();
    const response = await visitor.goto(`/fr/c/${slug}`);
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    await expect(visitor.getByRole("heading", { level: 1, name: "B6 club" })).toBeVisible();
    await expect(visitor.getByText("Aigles")).toBeVisible();
    await expect(visitor.getByText("Powerchair football à Namur.")).toBeVisible();
    await axe(visitor, "public page");
    // 3. A widget, embeddable by any site.
    const widget = await visitor.goto(`/fr/c/${slug}/widget/next`);
    expect(widget?.headers()["content-security-policy"]).toContain("frame-ancestors *");
    expect(widget?.headers()["x-frame-options"]).toBeUndefined();
    await expect(visitor.getByText("Pas de match prévu.")).toBeVisible();
    await guest.close();

    // 4. An API key, shown once, reads the teams.
    await page.getByRole("tab", { name: "API", exact: true }).click();
    await page.getByLabel("Nom de la clé").fill("Site du club");
    await page.getByRole("button", { name: "Créer une clé" }).click();
    const key = (await page.locator(".secret-value").innerText()).trim();
    expect(key).toMatch(/^pfm_[a-z0-9]{8}_/);
    const api = await page.request.get("/api/v1/teams", { headers: { Authorization: `Bearer ${key}` } });
    expect(api.status()).toBe(200);
    expect((await api.json()).data.map((t: { name: string }) => t.name)).toEqual(["Aigles"]);
    expect((await page.request.get("/api/v1/teams")).status()).toBe(401);
    await axe(page, "api");
  } finally {
    await db.end();
  }
});
