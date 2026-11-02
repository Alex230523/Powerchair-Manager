import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * « Fin de coach » on a phone (390 px): the button on the coach's file, the
 * departure prepared, its steps listed with what to do, a step skipped with
 * a reason, the settings card. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("a coach's departure, from the button to its steps", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `offboarding-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Départ", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club départ','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Présidente Départ' FROM person WHERE user_id=$2", [club, user]);
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Faucons') RETURNING id", [club, season])).rows[0].id;
    const coach = (
      await db.query("WITH pe AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,pe.id,'Coach Partant','{coach}' FROM pe RETURNING id", [club])
    ).rows[0].id as string;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-60)", [club, team, coach]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/fr/coaches/${coach}`);
    // 40: the presidency lands on « Vue d'ensemble ».
    await page.getByRole("tab", { name: "Profil" }).click();
    const card = page.locator("#departure");
    await card.getByRole("button", { name: "Fin de coach" }).click();
    await card.getByLabel("Raison").selectOption("moved");
    await axe(page, "departure form");
    await card.getByRole("button", { name: "Préparer le départ" }).click();
    await expect(card.getByText("Choisir un remplaçant : Faucons")).toBeVisible();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    const notify = card.locator("li").filter({ hasText: "Prévenir l'équipe et les parents" });
    await notify.getByText("Passer cette étape").click();
    await notify.getByLabel("Pourquoi ?").fill("Annoncé à l'entraînement");
    await notify.getByRole("button", { name: "Passer", exact: true }).click();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await axe(page, "departure steps");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/offboarding-390.png", fullPage: true });

    await page.goto("/fr/settings/members");
    const settings = page.locator("section").filter({ has: page.getByRole("heading", { name: "Fin de coach" }) }).last();
    await settings.getByLabel("Questionnaire de départ").uncheck();
    await settings.getByRole("button", { name: "Enregistrer" }).click();
    await expect(settings.getByRole("status")).toHaveText("Enregistré.");
    await axe(page, "departure settings");
  } finally {
    await db.end();
  }
});
