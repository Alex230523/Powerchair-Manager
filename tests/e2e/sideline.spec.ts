import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 14 at 390 px: the pitch side from start to end. A presence, then the
 * network goes: a goal and a card wait on the phone (« Hors connexion »),
 * the last one is taken back, the rest leaves in order when the network
 * comes back; another team's coach is refused. Axe.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("the pitch side, offline then synchronised", async ({ page, context }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `sideline-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Sam Terrain", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé terrain','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club du Terrain','club',$1) RETURNING id", [federation])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison terrain',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id as string;
    const label = (await db.query("SELECT CASE WHEN to_char(CURRENT_DATE,'MM-DD')>='07-01' THEN to_char(CURRENT_DATE,'YYYY')||'-'||to_char(CURRENT_DATE+interval '1 year','YY') ELSE to_char(CURRENT_DATE-interval '1 year','YYYY')||'-'||to_char(CURRENT_DATE,'YY') END AS l")).rows[0].l;
    const ana = await (async () => {
      const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana Buteuse','2000-01-01','{player}') RETURNING id", [club, person])).rows[0].id as string;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, id]);
      await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,'T-1','active',$5)", [federation, club, id, label, user]);
      return id;
    })();
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const created = await page.evaluate(
      async (x) => (await (await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: x.club, action: "create", teamId: x.team, opponent: "Lions", home: true, kind: "league", competition: "", startsAt: `${x.day}T14:00`, venue: "Salle", calendarEventId: null, notes: "" }) })).json()) as { id: string },
      { club, team, day },
    );
    await db.query("UPDATE attendance_invitation i SET response='present' FROM attendance_register r JOIN match m ON m.calendar_event_id=r.event_id WHERE i.register_id=r.id AND m.id=$1", [created.id]);
    await page.evaluate(
      async (x) => {
        await fetch("/api/matches/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: x.club, id: x.match, action: "lineup", players: [{ profileId: x.ana, starter: true, jerseyNumber: 9 }] }) });
      },
      { club, match: created.id, ana },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/fr/matches/${created.id}`);
    await page.getByRole("link", { name: "Ouvrir au bord du terrain" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aigles");
    await page.getByRole("button", { name: /Ana Buteuse/ }).click();
    await expect(page.getByText("En ligne")).toBeVisible();
    await axe(page, "presence");

    // No network: the actions wait on the phone.
    await context.setOffline(true);
    await page.getByRole("tab", { name: "Match" }).click();
    await page.getByRole("button", { name: "But pour nous" }).click();
    await page.getByLabel("Buteur").selectOption(ana);
    await page.getByRole("button", { name: "Enregistrer le but" }).click();
    await page.getByRole("button", { name: "Carton", exact: true }).click();
    await page.getByRole("button", { name: "Carton", exact: true }).last().click();
    await expect(page.getByText("Hors connexion : 2 actions en attente")).toBeVisible();
    await page.getByRole("button", { name: "Annuler la dernière action" }).click();
    await expect(page.getByText("Hors connexion : 1 actions en attente")).toBeVisible();
    await axe(page, "match offline");
    // The network comes back: the goal leaves.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM match_live_event WHERE match_id=$1 AND kind='goal' AND cancelled_at IS NULL", [created.id])).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int AS n FROM match_live_event WHERE match_id=$1 AND kind='yellow'", [created.id])).rows[0].n).toBe(0);
    expect((await db.query("SELECT i.actual FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN match m ON m.calendar_event_id=r.event_id WHERE m.id=$1 AND i.profile_id=$2", [created.id, ana])).rows[0].actual).toBe("present");
    await page.getByRole("tab", { name: "Fin" }).click();
    await expect(page.getByText("Buteurs : Ana Buteuse")).toBeVisible();
    await axe(page, "end");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/sideline-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
