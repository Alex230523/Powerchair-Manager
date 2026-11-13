import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (O1): a coach's first connection (the tour, once, then again from
 * Settings), their tasks by type, their driving licence and their course
 * request; then the president checks the licence and sees « Formé ».
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("coach: first-connection tour, tasks by type, licence, course request; president: check and « Formé »", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `o1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Camille Coach", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    // This account has never seen the tour.
    await db.query("DELETE FROM user_tutorial WHERE user_id=$1", [user]);
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('O1 fédération','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('O1 club','club',$1) RETURNING id", [federation])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const coachMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,'coach','{attendance.manage,people.read}') RETURNING id", [club, user])).rows[0].id;
    const presidentMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const person = (await db.query("SELECT id FROM person WHERE user_id=$1", [user])).rows[0]?.id ?? (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [user])).rows[0].id;
    const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Camille Coach','1990-04-02','{coach}') RETURNING id", [club, person])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Les Aigles') RETURNING id", [club, season])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-10)", [club, team, profile]);
    await db.query("INSERT INTO task(organization_id,kind,title,due_on,responsible_id,origin,created_by) VALUES($1,'transport','Réserver la camionnette',CURRENT_DATE+7,$2,'manual',$3)", [club, profile, user]);
    await db.query("INSERT INTO task(organization_id,kind,title,due_on,responsible_id,origin,created_by) VALUES($1,'training','Choisir les fiches',CURRENT_DATE+2,$2,'manual',$3)", [club, profile, user]);
    await db.query("INSERT INTO task(organization_id,kind,title,origin,created_by) VALUES($1,'documents','Pour personne','manual',$2)", [club, user]);
    await db.query("INSERT INTO training_course(federation_id,title,level,created_by) VALUES($1,'Coach niveau 1','1',$2)", [federation, user]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fr");
    await switchTo(page, coachMandate);

    // 1. The tour: five steps that point at the screen, skippable, once.
    const tour = page.getByRole("dialog", { name: "La saison" });
    await expect(tour).toBeVisible();
    await expect(tour).toContainText("Étape 1 sur 5");
    await expect(page.locator(".scope-bar")).toHaveAttribute("data-tour-target", "");
    await axe(page, "tour");
    for (const title of ["Le calendrier", "L'appel des présences", "À faire", "Votre profil"]) {
      await page.locator(".first-steps").getByRole("button", { name: "Suivant" }).click();
      await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    }
    await page.locator(".first-steps").getByRole("button", { name: "Terminer" }).click();
    await expect(page.locator(".first-steps")).toHaveCount(0);
    await expect.poll(async () => (await db.query("SELECT tutorial_seen_at IS NOT NULL AS seen FROM user_tutorial WHERE user_id=$1 AND audience='coach'", [user])).rows[0]?.seen).toBe(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    await expect(page.locator(".first-steps")).toHaveCount(0);
    // Settings > My account starts it again.
    await page.goto("/fr/settings/account");
    await page.getByRole("button", { name: "Revoir la visite guidée" }).click();
    await expect(page.getByRole("dialog", { name: "La saison" })).toBeVisible();
    await page.locator(".first-steps").getByRole("button", { name: "Passer" }).click();
    await expect(page.locator(".first-steps")).toHaveCount(0);

    // 2. Tasks (A1): « Mes tâches », one section per category, each sorted by date.
    await page.goto("/fr/tasks");
    await expect(page.locator("main summary").filter({ hasText: "Événements" })).toContainText("1 ouverte(s)");
    await expect(page.locator("main summary").filter({ hasText: /^Sport/ })).toContainText("1 ouverte(s)");
    await expect(page.getByText("Pour personne")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Catégorie", exact: true }).selectOption("events");
    await expect(page.locator("main summary").filter({ hasText: /^Sport/ })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Marquer comme faite : Réserver la camionnette" }).click();
    // 04/11/2026: a done task stays in the list, struck through, and can be reopened.
    await expect(page.getByRole("checkbox", { name: "Rouvrir : Réserver la camionnette" })).toBeChecked();
    await axe(page, "tasks");

    // 3. The coach's profile: « À faire » tab and the driving licence.
    await page.goto(`/fr/coaches/${profile}`);
    await expect(page.getByRole("heading", { name: "Camille Coach", level: 1 })).toBeVisible();
    await page.getByRole("tab", { name: "À faire" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Choisir les fiches");
    await page.getByRole("tab", { name: "Profil" }).click();
    const licence = page.locator("article.profile-card").filter({ has: page.getByRole("heading", { name: "Permis de conduire" }) });
    // 04/11/2026: « Ajouter un permis » opens a window with « Depuis le ».
    await licence.getByRole("button", { name: "Ajouter un permis" }).click();
    const licenceDialog = page.getByRole("dialog", { name: "Ajouter un permis" });
    await licenceDialog.getByRole("checkbox", { name: "B", exact: true }).check();
    await licenceDialog.getByLabel("Depuis le").fill("2012-03-01");
    await licenceDialog.getByLabel("Valable jusqu'au").fill("2030-05-01");
    await licenceDialog.getByLabel("Copie du permis (photo ou PDF, facultatif)").setInputFiles({ name: "permis.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\npermis") });
    await axe(page, "licence form");
    await licenceDialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(licence.getByText("1 mars 2012")).toBeVisible();
    await expect(licence.getByText("Déclaré", { exact: true })).toBeVisible();
    await expect(licence.getByRole("link", { name: "Voir la copie : permis.pdf" })).toBeVisible();

    // 4. Ask the federation to validate a course, with a proof.
    await page.getByRole("combobox", { name: "Formation", exact: true }).selectOption({ label: "Coach niveau 1 (1) · O1 fédération" });
    await page.getByLabel("Justificatif (attestation, photo ou PDF, facultatif)").setInputFiles({ name: "attestation.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nattestation") });
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByText("En attente de la fédération")).toBeVisible();
    await expect(page.getByText("Justificatif envoyé : attestation.pdf")).toBeVisible();
    await axe(page, "coach profile");

    // 5. The president checks the licence and, once the federation validates, sees « Formé ».
    await db.query("UPDATE training_request SET status='approved',decided_at=now(),completed_on='2026-06-20' WHERE profile_id=$1", [profile]);
    await switchTo(page, presidentMandate);
    await page.goto(`/fr/coaches/${profile}`);
    // 40: the presidency lands on « Vue d'ensemble ».
    await page.getByRole("tab", { name: "Profil" }).click();
    await page.getByRole("button", { name: "Marquer comme vérifié" }).click();
    await expect(page.getByText(/Vérifié par le club/)).toBeVisible();
    await page.goto("/fr/coaches");
    const row = page.locator(".directory-table tbody tr").filter({ hasText: "Camille Coach" });
    await expect(row.getByText("Formé", { exact: true })).toBeVisible();
    await expect(row.locator(".training-badge")).toHaveAttribute("title", /Coach niveau 1, validée le 20 juin 2026/);
    await axe(page, "coaches list");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/fr/tasks", `/fr/coaches/${profile}`]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
    }
    await axe(page, "coach 390");
    await page.screenshot({ path: "test-results/coaches-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
