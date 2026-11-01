import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * A5: one match sheet, before / match day / after, on a phone (390 px).
 * The call-up made at creation, the player without a licence flagged and
 * not selectable, the line-up, a goal typed offline then synchronised, the
 * result confirmed and the PDF sheet. Axe on each step.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a match from the call-up to the result", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a5-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A5 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('A5 fédé','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('A5 club','club',$1) RETURNING id", [federation])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const label = (await db.query("SELECT CASE WHEN extract(month FROM CURRENT_DATE)>=7 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int-1 END AS y")).rows[0].y as number;
    const players: Record<string, string> = {};
    for (const [name, licensed] of [["Ana Peeters", true], ["Bilal Haddad", false]] as const) {
      const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-01-01','{player}') RETURNING id", [club, person, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, id]);
      if (licensed)
        await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,'L-1','active',$5)", [federation, club, id, `${label}-${String(label + 1).slice(2)}`, user]);
      players[name] = id;
    }
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    // The match, created like the Matches page does: the call-up comes with it.
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const created = await page.request.post("/api/matches", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { organizationId: club, action: "create", teamId: team, opponent: "Lions", home: true, kind: "league", competition: "D1", startsAt: `${day}T14:00`, venue: "Salle du club", calendarEventId: null, notes: "" },
    });
    expect(created.status(), await created.text()).toBe(200);
    const match = (await created.json()).id;
    await db.query("UPDATE attendance_invitation i SET response='present' FROM attendance_register r JOIN match m ON m.calendar_event_id=r.event_id WHERE i.register_id=r.id AND m.id=$1", [match]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Avant: answers, the player without licence flagged and not selectable, the line-up.
    await page.goto(`/fr/matches/${match}`);
    await expect(page.getByRole("tab", { name: "Avant", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#journey-callup")).toContainText("Présent : 2");
    const bilal = page.locator(".journey-players li").filter({ hasText: "Bilal Haddad" });
    await expect(bilal).toContainText("Bloquant : pas de licence valide");
    await expect(bilal.getByRole("checkbox").first()).toBeDisabled();
    const ana = page.locator(".journey-players li").filter({ hasText: "Ana Peeters" });
    await ana.getByRole("checkbox").first().check();
    await ana.getByRole("checkbox", { name: "Titulaire" }).check();
    await ana.getByLabel("Numéro").fill("7");
    await axe(page, "before");
    await page.getByRole("button", { name: "Enregistrer la composition" }).click();
    await expect(page.getByRole("button", { name: "Publier la composition" })).toBeVisible();
    expect((await db.query("SELECT jersey_number,starter FROM match_player WHERE match_id=$1 AND profile_id=$2", [match, players["Ana Peeters"]])).rows[0]).toEqual({ jersey_number: 7, starter: true });

    // 2. Jour J: a goal typed without network, sent when it comes back.
    await page.getByRole("tab", { name: "Jour J", exact: true }).click();
    await expect(page.locator(".journey-score")).toContainText("0 - 0");
    await page.context().setOffline(true);
    await page.getByLabel("Minute").fill("12");
    await page.getByRole("button", { name: "But de Ana Peeters" }).click();
    await expect(page.locator(".journey-score")).toContainText("1 - 0");
    await expect(page.getByText(/Hors connexion : 1 fait/)).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM match_live_event WHERE match_id=$1", [match])).rows[0].n).toBe(0);
    await page.context().setOffline(false);
    await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM match_live_event WHERE match_id=$1", [match])).rows[0].n).toBe(1);
    await expect(page.getByText(/Hors connexion/)).toHaveCount(0);
    await axe(page, "match day");

    // 3. Après: the result confirmed, the PDF sheet.
    await page.getByRole("tab", { name: "Après", exact: true }).click();
    await expect(page.getByLabel("Notre score")).toHaveValue("1");
    await page.getByLabel("Score adverse").fill("0");
    await page.getByRole("button", { name: "Valider le résultat" }).click();
    await expect(page.getByText(/Résultat validé le/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir le brouillon d'annonce" })).toBeVisible();
    const pdf = await page.request.get(`/api/matches/journey/sheet?id=${match}`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await axe(page, "after");
  } finally {
    await db.end();
  }
});
