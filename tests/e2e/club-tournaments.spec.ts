import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Wave 16 (E3): the club's own tournaments, « Préparer un tournoi ». */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("club tournaments: prepare one, see it coming, past ones with their place", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `club-tournaments-${Date.now()}@example.test`;
  const year = new Date().getFullYear();
  try {
    await prepareSignIn(page, db, "Tournament president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Tournament club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const zoe = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Zoé','2010-01-01','{player}') RETURNING id", [club, person])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-1)", [club, team, zoe]);
    await db.query(
      "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,final_rank,teams_count,created_by,status) VALUES($1,'Coupe de Namur','tournament',make_date($2,1,10),make_date($2,1,10),2,8,$3,'done')",
      [club, year, user],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/fr/tournaments?year=${year}`);
    const section = page.locator(".club-tournaments-section");
    await expect(section.getByText("2e sur 8")).toBeVisible();
    await section.getByRole("button", { name: "Préparer un tournoi" }).click();
    const dialog = page.getByRole("dialog");
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(Date.now() + 10 * 86400000));
    await dialog.getByLabel("Nom du tournoi").fill("Tournoi de Liège");
    await dialog.getByLabel("Premier jour").fill(day);
    await dialog.getByLabel("Lieu (facultatif)").fill("Hall de Liège");
    await axe(page, "prepare");
    await dialog.getByRole("button", { name: "Préparer" }).click();
    await expect(page.getByText("Tournoi préparé : déplacement et événement créés.")).toBeVisible();
    await expect(section.getByText("Tournoi de Liège")).toBeVisible();
    await expect(section.getByText("Transport à organiser")).toBeVisible();
    const trip = (await db.query("SELECT calendar_event_id FROM trip WHERE organization_id=$1 AND title='Tournoi de Liège'", [club])).rows[0];
    expect(trip.calendar_event_id).toBeTruthy();
    expect((await db.query("SELECT count(*)::int AS n FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1", [trip.calendar_event_id])).rows[0].n).toBe(1);
    await axe(page, "club tournaments");
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await db.end();
  }
});
