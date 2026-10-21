import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (C7): the weekly digest in Settings > Notifications and digest:
 * on by default for a president, day, time and sections, the club's moment,
 * a preview queued at once, and the stop link of the email.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("weekly digest: settings, club moment, preview and stop link", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `digest-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Digest president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Digest club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. On by default for the president, next sending shown.
    await page.goto("/fr/settings/notifications");
    const panel = page.getByRole("region", { name: "Résumé hebdomadaire", exact: true });
    await expect(panel.getByRole("checkbox", { name: "Recevoir le résumé hebdomadaire" })).toBeChecked();
    await expect(panel.getByText(/^Prochain envoi :/)).toBeVisible();
    await expect(panel.getByRole("combobox", { name: /^Jour d’envoi/ })).toHaveValue("");

    // 2. Friday at 8:00, without the treasury.
    await panel.getByRole("combobox", { name: /^Jour d’envoi/ }).selectOption("5");
    await panel.getByRole("combobox", { name: /^Heure \(heure de Bruxelles\)/ }).selectOption("480");
    await panel.getByRole("checkbox", { name: "Solde de trésorerie" }).uncheck();
    await panel.getByRole("button", { name: "Enregistrer mon résumé" }).click();
    await expect(panel.getByRole("status")).toHaveText("Préférences du résumé enregistrées.");
    expect((await db.query("SELECT email_enabled,digest_day,digest_minute,digest_sections FROM notification_preference WHERE user_id=$1 AND category='digest'", [user])).rows[0]).toMatchObject({
      email_enabled: true,
      digest_day: 5,
      digest_minute: 480,
    });
    await expect(panel.getByText(/^Prochain envoi : vendredi/)).toBeVisible();

    // 3. The club's moment (president).
    await panel.getByRole("combobox", { name: /^Jour par défaut du club/ }).selectOption("1");
    await panel.getByRole("button", { name: "Enregistrer pour le club" }).click();
    await expect(panel.getByRole("status")).toHaveText("Moment du club enregistré.");
    expect((await db.query("SELECT digest_day,digest_minute FROM organization WHERE id=$1", [club])).rows[0]).toEqual({ digest_day: 1, digest_minute: 450 });

    // 4. A preview: nothing to say yet, then an event of the club in two days.
    await panel.getByRole("button", { name: "Recevoir un aperçu maintenant" }).click();
    await expect(panel.getByRole("status")).toHaveText("Rien à signaler aujourd’hui : aucun aperçu n’a été envoyé.");
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility)
       VALUES($1,$2,1,'Fête du club','association','Europe/Brussels',now()+interval '2 days',now()+interval '2 days 2 hours','2026-01-01T18:00','2026-01-01T20:00',$3,'organization')`,
      [club, series, user],
    );
    await db.query("DELETE FROM digest_send WHERE user_id=$1", [user]);
    await panel.getByRole("button", { name: "Recevoir un aperçu maintenant" }).click();
    await expect(panel.getByRole("status")).toHaveText("Aperçu préparé : il arrive dans quelques instants.");
    expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND kind='weekly_digest' AND category='digest'", [user])).rows[0].n).toBe(1);
    await axe(page, "digest settings");

    // 5. 320 px: the panel fits.
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 6. The stop link at the bottom of the email.
    const send = (await db.query("SELECT id FROM digest_send WHERE user_id=$1", [user])).rows[0].id;
    await page.goto(`/fr/desinscription/${send}`);
    await expect(page.getByRole("heading", { name: "Résumé hebdomadaire" })).toBeVisible();
    await page.getByRole("button", { name: "Ne plus le recevoir" }).click();
    await expect(page.getByRole("status")).toContainText("vous ne recevrez plus le résumé hebdomadaire de Digest club");
    await axe(page, "digest stop");
    expect((await db.query("SELECT email_enabled FROM notification_preference WHERE user_id=$1 AND category='digest'", [user])).rows[0].email_enabled).toBe(false);
  } finally {
    await db.end();
  }
});
