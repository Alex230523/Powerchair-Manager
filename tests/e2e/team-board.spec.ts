import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";
import { brusselsDay } from "../../src/lib/today";

/**
 * A6: the team page opens on its dashboard. What blocks is at the top and
 * leads to the player's line; quick actions; the squad with its pills; the
 * next meeting with its answers; the empty team says so. Axe and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the team page as a dashboard", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a6-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A6 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('A6 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const empty = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Vide') RETURNING id", [club, season])).rows[0].id;
    for (const name of ["Ana Peeters", "Bilal Haddad"]) {
      const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,$3,'{player}') RETURNING id", [club, person, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, id]);
    }
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    const day = brusselsDay(new Date(Date.now() + 2 * 86400000));
    const created = await page.request.post("/api/calendar", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        organizationId: club,
        action: "create",
        requestId: crypto.randomUUID(),
        title: "Entraînement du samedi",
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: day + "T10:00",
        localEnd: day + "T12:00",
        fold: "reject",
        teamId: team,
        placeId: null,
        responsibleId: user,
        visibility: "team",
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. The dashboard first; what blocks leads to the player.
    await page.goto(`/fr/teams/${team}`);
    await expect(page.getByRole("tab", { name: "Tableau de bord", exact: true })).toHaveAttribute("aria-selected", "true");
    const alert = page.locator(".team-board-alert");
    await expect(alert).toContainText("2 joueur(s) sans licence valide");
    await expect(alert).toContainText("2 joueur(s) sans fauteuil attribué");
    await alert.getByRole("link", { name: "2 joueur(s) sans licence valide" }).click();
    await expect(page).toHaveURL(/#team-player-/);
    const squad = page.locator(".team-board-squad li").filter({ hasText: "Ana Peeters" });
    await expect(squad).toContainText("Pas de licence");
    await expect(squad).toContainText("Pas de fauteuil");
    // 2. Quick actions and the next meeting.
    await expect(page.getByRole("navigation", { name: "Actions rapides" }).getByRole("link", { name: "Émettre les cotisations de l'équipe" })).toHaveAttribute("href", `/fr/dues?team=${team}`);
    await expect(page.locator("#team-board-events")).toContainText("Entraînement du samedi");
    await axe(page, "team board");
    // 3. The issue wizard opens on the team.
    await page.getByRole("link", { name: "Émettre les cotisations de l'équipe" }).click();
    const wizard = page.getByRole("dialog", { name: "Émettre des cotisations" });
    await expect(wizard).toBeVisible();
    // 4. An empty team says so.
    await page.goto(`/fr/teams/${empty}`);
    await expect(page.locator("#team-board-squad")).toContainText("Aucun joueur dans cette équipe");
    await expect(page.locator(".team-board-alert")).toHaveCount(0);
    await axe(page, "empty team");
  } finally {
    await db.end();
  }
});
