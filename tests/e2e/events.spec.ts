import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (E1): the « Nouvel événement » button, types, invitations by group, trip, delete. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("events: button in the header, a training for Équipe A with answers, a trip, deleted", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `events-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Events president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Events club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id", [club, season])).rows[0].id;
    const zoe = (
      await db.query(
        "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Zoé Martin','2010-01-01','{player}' FROM p RETURNING id",
        [club],
      )
    ).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-1)", [club, team, zoe]);
    // Brussels' day in three days, the day the form shows (UTC differs from 22:00).
    const start = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(Date.now() + 3 * 86400000));
    await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Bus du mardi','other',$3::date,$3::date,$2)", [club, user, start]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // 1. The button sits in the page header, at 1440 and at 390 px.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/fr/calendar");
    const button = page.locator("header").getByRole("button", { name: "Nouvel événement" });
    await expect(button).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(button).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    // 2. A training: the type proposes « L'équipe de l'événement », Zoé is invited with an answer.
    await button.click();
    const editor = page.locator("#event-editor");
    await editor.getByLabel("Titre", { exact: true }).fill("Entraînement du mardi");
    await expect(editor.getByLabel("Type", { exact: true })).toHaveValue(/.+/);
    await editor.getByLabel("Début (heure locale)").fill(`${start}T18:00`);
    await editor.getByLabel("Fin (heure locale)").fill(`${start}T20:00`);
    await editor.getByLabel("Équipe", { exact: true }).selectOption({ label: "Équipe A" });
    await expect(editor.getByLabel("L'équipe de l'événement")).toBeChecked();
    await expect(editor.getByText("1 personne invitée")).toBeVisible();
    await editor.getByLabel("Relier un déplacement existant").selectOption({ label: `Bus du mardi · ${start}` });
    await axe(page, "event form");
    await editor.getByRole("button", { name: "Enregistrer l’événement" }).click();
    await expect(page.getByText("Enregistré.", { exact: true })).toBeVisible();
    const event = (await db.query("SELECT id FROM calendar_event WHERE organization_id=$1 AND title='Entraînement du mardi'", [club])).rows[0].id;
    expect((await db.query("SELECT count(*)::int AS n FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1", [event])).rows[0].n).toBe(1);

    // 3. The event sheet: answers, the trip; then deleted (nobody answered yet).
    await page.goto(`/fr/calendar?event=${event}`);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Réponses/)).toContainText("Sans réponse 1");
    await expect(sheet.getByText(/Bus du mardi/)).toBeVisible();
    await axe(page, "event sheet");
    await sheet.getByRole("button", { name: "Supprimer" }).click();
    await sheet.getByRole("button", { name: "Confirmer la suppression" }).click();
    await expect(page.getByText("Événement supprimé.")).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE id=$1", [event])).rows[0].n).toBe(0);
  } finally {
    await db.end();
  }
});
