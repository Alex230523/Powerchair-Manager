import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * H9 and H10 on a phone (390 px): « Planifier la saison », a slot whose
 * dates skip the autumn break, a date brought back, the series created;
 * then the keys in a coach's profile. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("the season planned on a phone, and a coach's keys", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `season-schedule-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Planning", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club du planning','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027',LEAST('2026-09-01'::date,CURRENT_DATE-1),GREATEST('2027-06-30'::date,CURRENT_DATE+200)) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles')", [club, season]);
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const coach = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Clés','{coach}') RETURNING id", [club, person])).rows[0].id;
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/calendar/season");
    await expect(page.getByRole("heading", { name: "Planifier la saison", level: 1 })).toBeVisible();
    await expect(page.getByText("Congé d'automne").first()).toBeVisible();
    await axe(page, "season planner");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Ajouter un créneau" }).click();
    await page.getByLabel("Du", { exact: true }).last().fill("2026-10-01");
    await page.getByLabel("Au", { exact: true }).last().fill("2026-11-30");
    await page.getByRole("button", { name: "Voir les dates" }).click();
    await expect(page.getByText(/Congé d'automne$/).first()).toBeVisible();
    await page.getByRole("button", { name: /Réactiver : .*21 oct/ }).click();
    await expect(page.getByText("Congé d'automne (réactivée)")).toBeVisible();
    await axe(page, "season planner preview");
    await page.getByLabel("Envoyer l'email « Calendrier de la saison » aux familles des équipes").uncheck();
    await page.getByRole("button", { name: "Créer les séances" }).click();
    await expect(page.locator(".records").filter({ hasText: "Aigles · mercredi" })).toBeVisible();
    expect(Number((await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1", [club])).rows[0].n)).toBeGreaterThan(4);

    // H10: the keys in the coach's profile.
    await page.goto(`/fr/coaches/${coach}`);
    await expect(page.getByRole("heading", { name: "Clés et badges" })).toBeVisible();
    await page.getByLabel("Clé ou badge").fill("Local du club");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("Local du club")).toBeVisible();
    await axe(page, "coach keys");
    await page.screenshot({ path: "test-results/season-schedule-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
