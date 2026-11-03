import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 31: « Suivi » written by the coach, then « Mon suivi » read by the parent, without the private note. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.goto("/fr");
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("player follow-up: objective, feedback and private note by the coach, read by the parent", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `progress-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Coach Lina", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const person = (await db.query("SELECT id FROM person WHERE user_id=$1", [user])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club Suivi','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const coachMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,'coach',$3) RETURNING id", [club, user, team])).rows[0].id;
    const own = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Lina','{coach}') RETURNING id", [club, person])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [club, team, own]);
    const childPerson = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const child = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Martin','2013-05-01','{player}') RETURNING id", [club, childPerson])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, child]);
    await switchTo(page, coachMandate);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The coach's « Suivi »: an objective, a feedback, a private note.
    await page.goto(`/fr/players/${child}?tab=progress`);
    await expect(page.getByRole("tab", { name: "Suivi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("table", { name: /Chiffres de la saison/ })).toBeVisible();
    await page.getByLabel("Domaine").selectOption("driving");
    await page.getByLabel("Objectif", { exact: true }).fill("Demi-tour serré sans toucher le plot");
    await page.getByRole("button", { name: "Fixer un objectif" }).click();
    const status = page.getByLabel("Où en est l'objectif Demi-tour serré sans toucher le plot");
    await status.selectOption("acquired");
    await expect(page.getByText("Acquis", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Retour au joueur").fill("Très bon placement en défense.");
    await page.getByRole("button", { name: "Envoyer le retour" }).click();
    await expect(page.getByText("Très bon placement en défense.")).toBeVisible();
    await page.getByLabel("Note privée").fill("Fatigue en fin de séance, à surveiller.");
    await page.getByRole("button", { name: "Ajouter la note" }).click();
    await expect(page.getByText("Fatigue en fin de séance, à surveiller.")).toBeVisible();
    await axe(page, "coach follow-up");

    // 2. The same person is now the parent, no longer a coach of the team.
    await db.query("UPDATE team_membership SET closed_at=now() WHERE profile_id=$1", [own]);
    await db.query(
      "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
      [club, own, child, user],
    );
    const parentMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'guardian') RETURNING id", [club, user])).rows[0].id;
    await switchTo(page, parentMandate);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/fr/players/${child}?tab=progress`);
    await expect(page.getByRole("tab", { name: "Mon suivi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Très bon placement en défense.")).toBeVisible();
    await expect(page.getByText("Fatigue en fin de séance")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Notes privées du coach" })).toHaveCount(0);
    await page.getByRole("button", { name: "Vu", exact: true }).click();
    await expect(page.getByText(/Vu le /)).toBeVisible();
    await page.getByLabel("Votre réaction (courte)").fill("Merci coach !");
    await page.getByRole("button", { name: "Répondre" }).click();
    await expect(page.getByText("Réaction : Merci coach !")).toBeVisible();
    await axe(page, "parent follow-up");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await db.end();
  }
});
