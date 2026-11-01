import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (E2): the exercise library and a training's programme. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

test("exercise sheets: create with a diagram, open, print, programme of a training", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `exercises-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Exercises president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Exercises club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A new sheet with its diagram.
    await page.goto("/fr/exercises");
    await expect(page.getByText("Aucune fiche pour l'instant.")).toBeVisible();
    await page.getByRole("button", { name: "Nouvelle fiche" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titre").fill("Slalom fauteuil");
    await dialog.getByLabel("Objectif").selectOption("driving");
    await dialog.getByLabel("Durée (minutes)").fill("20");
    await dialog.getByLabel("Déroulé (les étapes)").fill("1. Plots en ligne\n2. Aller-retour");
    await dialog.getByLabel("Étiquettes (séparées par des virgules)").fill("conduite, échauffement");
    await dialog.getByLabel("Schéma (image ou PDF, 2 Mo maximum)").setInputFiles({ name: "schema.png", mimeType: "image/png", buffer: png });
    await axe(page, "sheet form");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    const card = page.getByRole("link", { name: /Slalom fauteuil/ });
    await expect(card).toContainText("20 min");
    await expect(card.locator("img")).toHaveCount(1);
    await axe(page, "library");
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 2. The sheet itself, ready to print.
    await card.click();
    await expect(page.getByRole("heading", { level: 1, name: "Slalom fauteuil" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Schéma de l'exercice Slalom fauteuil" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();
    await axe(page, "sheet");

    // 3. In a training's programme: the sheet shows « Programme » with the total.
    const sheetId = (await db.query("SELECT id FROM exercise WHERE organization_id=$1", [club])).rows[0].id;
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    const event = (
      await db.query(
        "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement','training','Europe/Brussels',now()+interval '2 days',now()+interval '2 days 2 hours','2026-10-23T18:00','2026-10-23T20:00',$3,'organization') RETURNING id",
        [club, series, user],
      )
    ).rows[0].id;
    await db.query("INSERT INTO calendar_event_exercise(event_id,organization_id,exercise_id,position,planned_minutes,notes) VALUES($1,$2,$3,1,25,'Regard haut')", [event, club, sheetId]);
    await page.goto(`/fr/calendar?event=${event}`);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Programme" })).toBeVisible();
    await expect(sheet.getByText("Durée totale : 25 min")).toBeVisible();
    await sheet.getByRole("link", { name: "Imprimer le programme" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Programme de l'entraînement/ })).toBeVisible();
    await expect(page.getByText("Regard haut")).toBeVisible();
    await axe(page, "programme print");
  } finally {
    await db.end();
  }
});
