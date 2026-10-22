import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B7: Réglages › Notifications › Automatisations. A rule switched on with
 * its delay, the simulation that sends nothing, the global stop. Axe and
 * 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the club's automations", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b7-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B7 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B7 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO club_document(organization_id,season_id,name,category,status,expires_on) VALUES($1,$2,'Assurance du club','insurance','valid',CURRENT_DATE+10)", [club, season]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // 1. The catalogue, built-in reminders on, the others off.
    await page.goto("/fr/settings/notifications");
    const section = page.locator("#settings-automations");
    await expect(section.getByRole("heading", { name: "Automatisations" })).toBeVisible();
    const rule = section.locator(".automation-rule").filter({ has: page.getByRole("heading", { name: "Pièce qui expire" }) });
    await expect(rule.getByLabel("Activée")).not.toBeChecked();
    await expect(section.locator(".automation-rule").filter({ has: page.getByRole("heading", { name: "Convocation sans réponse" }) }).getByLabel("Activée")).toBeChecked();

    // 2. Switched on, 30 days before, to the presidency.
    await rule.getByLabel("Activée").check();
    await rule.getByLabel(/^Délai/).fill("30");
    await rule.getByLabel("Destinataires").selectOption("president");
    await rule.getByRole("button", { name: "Enregistrer : Pièce qui expire" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Automatisation enregistrée." })).toBeAttached();

    // 3. The simulation lists what would leave, nothing is sent.
    await section.getByRole("button", { name: "Simuler aujourd'hui" }).click();
    const row = section.getByRole("row").filter({ hasText: "Assurance du club" });
    await expect(row).toContainText("Partirait");
    expect((await db.query("SELECT count(*)::int AS n FROM automation_run WHERE organization_id=$1", [club])).rows[0].n).toBe(0);
    await axe(page, "automations");

    // 4. The global stop, then resumed.
    await section.getByRole("button", { name: "Tout arrêter maintenant" }).click();
    await expect(section.getByText("Tout est à l'arrêt")).toBeVisible();
    expect((await db.query("SELECT automations_stopped FROM organization WHERE id=$1", [club])).rows[0].automations_stopped).toBe(true);
    await section.getByRole("button", { name: "Reprendre les automatisations" }).click();
    await expect(section.getByText("Les automatisations actives tournent.")).toBeVisible();

    // 5. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/settings/notifications");
    await expect(section.getByRole("heading", { name: "Automatisations" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "automations 390");
  } finally {
    await db.end();
  }
});
