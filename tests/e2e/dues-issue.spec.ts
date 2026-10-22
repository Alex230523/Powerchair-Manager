import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * A3: « Émettre des cotisations » is always there for the president. With
 * no rate yet, the wizard starts by creating one; then a whole team, with
 * the preview and an exemption; the email to the families; the empty state
 * explains what to do. Axe and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("issue membership fees from the wizard, without a rate beforehand", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a3-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A3 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('A3 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    for (const name of ["Ana Martin", "Bilal Haddad"]) {
      const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,$2,'2010-01-01','{player}' FROM p RETURNING id", [club, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, id]);
    }
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // 1. Nothing issued: the empty state says what to do.
    await page.goto("/fr/dues");
    await expect(page.getByText("Aucune cotisation émise pour cette saison.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Émettre des cotisations" }).first()).toBeEnabled();
    await page.getByRole("button", { name: "Émettre des cotisations" }).first().click();
    const wizard = page.getByRole("dialog", { name: "Émettre des cotisations" });

    // 2. No rate yet: it is created on the spot.
    await expect(wizard.getByRole("radio", { name: "Créer un barème" })).toBeChecked();
    await wizard.getByLabel(/^Catégorie/).fill("Joueur");
    await wizard.getByLabel("Montant (€)").fill("250");
    await wizard.getByLabel("Nombre maximum de versements").fill("4");
    await wizard.getByLabel("Première échéance").fill("2026-11-01");
    await axe(page, "wizard step 1");
    await wizard.getByRole("button", { name: "Suivant" }).click();

    // 3. A whole team, with the preview and an exemption.
    await wizard.getByRole("radio", { name: "Une équipe" }).check();
    await wizard.getByLabel("Équipe").selectOption({ label: "Aigles" });
    await wizard.getByLabel("Nombre de versements").fill("4");
    await wizard.getByRole("button", { name: "Voir l'aperçu" }).click();
    await expect(wizard.getByRole("row").filter({ hasText: "Ana Martin" })).toContainText("250,00");
    await wizard.getByLabel("Exonérer Bilal Haddad").check();
    await wizard.getByLabel("Motif de l'exonération de Bilal Haddad").fill("Situation familiale");
    await axe(page, "wizard step 2");
    await wizard.getByRole("button", { name: "Suivant" }).click();

    // 4. Confirm: two fees, one exempted.
    await expect(wizard).toContainText("2 cotisation(s) seront émises");
    await wizard.getByRole("button", { name: "Émettre", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "2 cotisation(s) émise(s)." })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Ana Martin" }).first()).toContainText("250,00");
    expect((await db.query("SELECT count(*)::int AS n FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1", [club])).rows[0].n).toBe(8);
    await axe(page, "dues");

    // 5. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/dues");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "dues 390");
  } finally {
    await db.end();
  }
});
