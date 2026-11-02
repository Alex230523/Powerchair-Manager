import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (C5): a friendly between two clubs of the federation (invitation,
 * acceptance, both sides), the full line with its tips on keyboard focus,
 * transport at home or organised from the template, the score proposed by
 * one club and confirmed by the other, and the tournament matches by day.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("friendly between clubs: invitation, line, transport, score to confirm, tournament matches", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `c5-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "C5 présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('C5 fédération','federation') RETURNING id")).rows[0].id;
    const clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('C5 club A','club',$1) RETURNING id", [federation])).rows[0].id;
    const clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('C5 club B','club',$1) RETURNING id", [federation])).rows[0].id;
    const mandate: Record<string, string> = {};
    for (const [key, org] of [["A", clubA], ["B", clubB]] as const) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
      mandate[key] = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [org, user])).rows[0].id;
    }
    const team = async (org: string, name: string) => {
      const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [org])).rows[0].id;
      return (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3) RETURNING id", [org, season, name])).rows[0].id as string;
    };
    const aigles = await team(clubA, "Aigles");
    const ours = await team(clubB, "Ours");
    for (const [org, t, name, role] of [
      [clubA, aigles, "Ana Martin", "player"],
      [clubA, aigles, "Bilal Haddad", "player"],
      [clubA, aigles, "Coach Aigles", "coach"],
      [clubB, ours, "Coach Ours", "coach"],
    ] as const) {
      const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2008-01-01' FROM p RETURNING id", [org, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-30)", [org, t, id, role]);
    }
    await db.query("INSERT INTO calendar_place(organization_id,name,address,home) VALUES($1,'Salle du club','Rue 1',true)", [clubA]);
    const date = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
    await page.goto("/fr");
    await switchTo(page, mandate.A);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Club A invites club B's team.
    await page.goto("/fr/matches");
    // 1: one « Nouveau match », then « Amical ».
    await page.getByRole("button", { name: "Nouveau match", exact: true }).click();
    await page.getByRole("dialog", { name: "Quel match ?" }).getByRole("button", { name: /^Amical/ }).click();
    const win = page.getByRole("dialog", { name: "Nouveau match amical" });
    await win.getByLabel("Notre équipe").selectOption({ label: "Aigles" });
    await win.getByLabel("Adversaire").selectOption({ label: "Ours" });
    await win.getByLabel("Date et heure").fill(`${date}T14:00`);
    await win.getByRole("combobox", { name: "Lieu", exact: true }).selectOption({ label: "Salle du club" });
    await win.getByLabel("Message (facultatif)").fill("Match de préparation");
    await axe(page, "friendly window");
    await win.getByRole("button", { name: "Créer le match" }).click();
    const row = page.locator(".ledger tbody tr").filter({ hasText: "C5 club B · Ours" });
    await expect(row).toContainText("Invitation envoyée");
    await expect(row).toContainText("En ordre (domicile)");

    // 2. The line: the tip opens on keyboard focus and closes with Escape.
    const players = row.getByRole("button", { name: /^Joueurs 0\/2/ });
    await players.focus();
    const tip = row.getByRole("tooltip").filter({ hasText: "Sans réponse : Ana Martin, Bilal Haddad" });
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await expect(row).toContainText("Pas encore désigné");
    await axe(page, "match line");

    // 3. Club B accepts; the match is on its side, the transport to organise.
    await switchTo(page, mandate.B);
    await page.goto("/fr/matches");
    await page.getByRole("button", { name: "Accepter l'invitation de C5 club A" }).click();
    const theirs = page.locator(".ledger tbody tr").filter({ hasText: "C5 club A · Aigles" });
    await expect(theirs).toContainText("À organiser");
    await theirs.getByRole("button", { name: "Organiser le transport : C5 club A · Aigles" }).click();
    await expect(page.getByRole("status").filter({ hasText: "5 tâches de transport créées." })).toBeVisible();
    await expect(theirs.getByRole("link", { name: "Tâches de transport (5)" })).toBeVisible();

    // 4. Club B enters the score; club A sees « à confirmer » and confirms.
    const ids = (await db.query("SELECT id,organization_id,version FROM match WHERE organization_id=ANY($1::uuid[])", [[clubA, clubB]])).rows;
    await db.query("UPDATE match SET starts_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])", [ids.map((r) => r.id)]);
    const b = ids.find((r) => r.organization_id === clubB)!;
    const result = await page.request.post("/api/matches", { headers: { origin }, data: { organizationId: clubB, action: "result", id: b.id, version: b.version, ourScore: 1, theirScore: 3, stats: [] } });
    expect(result.status()).toBe(200);
    await switchTo(page, mandate.A);
    await page.goto("/fr/matches");
    await page.getByLabel("Afficher").selectOption("all");
    const played = page.locator(".ledger tbody tr").filter({ hasText: "C5 club B · Ours" });
    await expect(played).toContainText("3-1");
    await expect(played).toContainText("à confirmer");
    await played.getByRole("button", { name: "Confirmer le score : C5 club B · Ours" }).click();
    await expect(played).not.toContainText("à confirmer");
    expect((await db.query("SELECT DISTINCT score_status FROM match WHERE id=ANY($1::uuid[])", [ids.map((r) => r.id)])).rows).toEqual([{ score_status: "confirmed" }]);

    // 5. Federal tournament matches, by day.
    const tournament = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe C5',2026,'league') RETURNING id", [federation])).rows[0].id;
    for (const org of [clubA, clubB]) await db.query("INSERT INTO tournament_club(tournament_id,organization_id,status) VALUES($1,$2,'accepted')", [tournament, org]);
    const day = (await db.query("INSERT INTO tournament_day(tournament_id,label,day,venue) VALUES($1,'Journée 1',CURRENT_DATE+20,'Namur') RETURNING id", [tournament])).rows[0].id;
    await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id) VALUES($1,$2,'10:00','league',$3,$4)", [tournament, day, clubA, clubB]);
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Coupe C5 · Journée 1/ })).toBeVisible();
    await axe(page, "matches");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/matches");
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "matches 390");
  } finally {
    await db.end();
  }
});
