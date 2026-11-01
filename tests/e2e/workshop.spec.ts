import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B3: the chairs' workshop on a phone (390 px). Tomorrow's match: a player
 * without a chair gets a club chair; a breakdown reported from the chair's
 * sheet takes it out of service; the repair in « Atelier » gives it back;
 * the chair's report as a PDF. Axe on each step.
 */
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a chair for each player, a breakdown and its repair", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b3-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B3 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B3 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const players: Record<string, string> = {};
    for (const name of ["Ana Peeters", "Bilal Haddad"]) {
      const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      players[name] = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-01-01','{player}') RETURNING id", [club, person, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, players[name]]);
    }
    const own = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Strike d''Ana','in_use','player') RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [club, own, players["Ana Peeters"], user]);
    const spare = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Club 1','available','club') RETURNING id", [club])).rows[0].id;
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    const event = (
      await db.query(
        "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Match contre les Lions','friendly','Europe/Brussels',now()+interval '1 day',now()+interval '1 day 2 hours','2026-11-02T14:00','2026-11-02T16:00',$3,$4,'organization') RETURNING id",
        [club, series, team, user],
      )
    ).rows[0].id;
    const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '12 hours') RETURNING id", [club, event])).rows[0].id;
    for (const id of Object.values(players)) await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present')", [club, register, id]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Atelier: Bilal has no chair for tomorrow; a club chair is booked for him.
    await page.goto("/fr/equipment");
    await page.getByRole("tab", { name: "Atelier", exact: true }).click();
    const match = page.locator(".workshop-event").filter({ hasText: "Match contre les Lions" });
    await expect(match).toContainText("Sans fauteuil utilisable : 1");
    const bilal = match.locator("li").filter({ hasText: "Bilal Haddad" });
    await expect(bilal).toContainText("Pas de fauteuil utilisable");
    await axe(page, "workshop");
    await bilal.getByRole("combobox", { name: "Fauteuil du club pour Bilal Haddad", exact: true }).selectOption({ label: "Club 1" });
    await bilal.getByRole("button", { name: /^Réserver/ }).click();
    await expect(match).toContainText("Chaque joueur attendu a un fauteuil utilisable.");
    await expect(bilal).toContainText("Réservé : Club 1");
    expect((await db.query("SELECT profile_id FROM chair_booking WHERE chair_id=$1 AND status='booked'", [spare])).rows[0].profile_id).toBe(players["Bilal Haddad"]);

    // 2. Ana's chair breaks down: reported from its sheet, out of service at once.
    await page.goto(`/fr/equipment/${own}`);
    await page.getByRole("button", { name: "Signaler une panne", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Signaler une panne : Strike d'Ana" });
    await dialog.getByLabel("Que se passe-t-il ?").fill("Le moteur gauche ne répond plus");
    await axe(page, "report", "dialog[open]");
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Panne signalée" })).toBeVisible();
    await expect(page.locator(".chair-key")).toContainText("Hors service");
    expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [own])).rows[0].status).toBe("out_of_service");

    // 3. The repair in « Atelier » gives it back; the report as a PDF.
    await page.getByRole("tab", { name: "Atelier", exact: true }).click();
    await expect(page.getByText("Le moteur gauche ne répond plus")).toBeVisible();
    await page.getByRole("combobox", { name: "Type", exact: true }).selectOption({ label: "Réparation" });
    await page.getByLabel("Coût (€)").fill("80");
    await page.getByLabel("Diagnostic").fill("Connecteur du moteur");
    await page.getByRole("checkbox", { name: "Le fauteuil est de nouveau utilisable" }).click();
    await page.getByRole("button", { name: "Ajouter une intervention" }).click();
    await expect(page.locator(".workshop-log")).toContainText("Réparation");
    await expect.poll(async () => (await db.query("SELECT status FROM equipment_chair WHERE id=$1", [own])).rows[0].status).toBe("in_use");
    await axe(page, "chair workshop");
    const pdf = await page.request.get(`/api/equipment/workshop/report?chair=${own}&format=pdf`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  } finally {
    await db.end();
  }
});
