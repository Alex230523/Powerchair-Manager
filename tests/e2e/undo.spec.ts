import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C10): archiving a team needs no confirmation any more; a short
 * message says it, with "Annuler", which puts it back on the server; too
 * late, it is refused; the message waits while hovered.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("undo: archive a team, cancel it, too late, hover pause", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `undo-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Undo president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Undo club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const archived = async () => (await db.query("SELECT archived FROM team WHERE id=$1", [team])).rows[0].archived as boolean;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. One click archives (no confirmation), the message offers "Annuler".
    await page.goto("/fr/club/manage");
    // The team's own line in the Teams panel (a team selector elsewhere also says "Lions").
    const lions = page.locator("#teams li").filter({ has: page.locator("strong", { hasText: /^Lions$/ }) });
    await lions.getByRole("button", { name: "Archiver", exact: true }).click();
    const toast = page.locator(".toast");
    await expect(toast).toContainText("Équipe archivée");
    await expect.poll(archived).toBe(true);
    await axe(page, "toast");

    // 2. "Annuler" puts it back on the server.
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(toast).toContainText("C’est annulé.");
    await expect.poll(archived).toBe(false);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='undo.teamArchive' AND target_id=$1", [team])).rows[0].n).toBe(1);

    // 3. Too late: the server refuses once the delay is over.
    await lions.getByRole("button", { name: "Archiver", exact: true }).click();
    await expect(toast).toContainText("Équipe archivée");
    await db.query("UPDATE undo_action SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE user_id=$1 AND used_at IS NULL", [user]);
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(toast).toContainText("Trop tard pour annuler");
    expect(await archived()).toBe(true);

    // 4. The message stays while hovered, then leaves after 8 seconds.
    await lions.getByRole("button", { name: "Réactiver", exact: true }).click();
    await expect(toast).toContainText("Équipe réactivée");
    await toast.hover();
    await page.waitForTimeout(9000);
    await expect(toast).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(toast).toBeHidden({ timeout: 12000 });

    // 5. 390 px: the message fits the screen.
    await page.setViewportSize({ width: 390, height: 844 });
    await lions.getByRole("button", { name: "Archiver", exact: true }).click();
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  } finally {
    await db.end();
  }
});
