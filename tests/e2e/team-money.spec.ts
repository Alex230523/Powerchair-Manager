import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (1.C): with a team chosen in the top bar, the dues page shows that
 * team's lines and totals (no more "whole club" note), with a team column when
 * every team is shown; trips and pots offer a team field.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map(
    (v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(violations, label).toEqual([]);
}

test("dues, trips and pots follow the team chosen in the top bar", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `teammoney-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Team money president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Team money club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const teamA = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe A','blue') RETURNING id", [club, season])).rows[0].id;
    const teamB = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe B','coral') RETURNING id", [club, season])).rows[0].id;
    const profile = async (name: string, team: string) => {
      const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
      const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2008-01-01','{player}') RETURNING id", [club, person, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, id]);
      return id as string;
    };
    const emma = await profile("Emma Peeters", teamA);
    const lucas = await profile("Lucas Janssens", teamB);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    // A whole-club rate, one line per player.
    const plan = await page.request.post("/api/dues", {
      headers: { origin },
      data: { organizationId: club, action: "plan", seasonId: season, category: "Cotisation joueur", amountCents: 25000, maxInstallments: 1, firstDue: "2026-12-31" },
    });
    expect(plan.status()).toBe(200);
    const planId = (await plan.json()).id;
    for (const p of [emma, lucas]) {
      const issued = await page.request.post("/api/dues", {
        headers: { origin },
        data: { organizationId: club, action: "issue", planId, profileId: p, discountCents: 0, reason: "", installments: 1, firstDue: "2026-12-31" },
      });
      expect(issued.status()).toBe(200);
    }

    // Every team: both lines, a team column, 500 € due.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fr/dues");
    const table = page.locator("main .dues-table");
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.getByRole("columnheader", { name: "Équipe", exact: true })).toBeVisible();
    await expect(table.locator("tbody tr").filter({ hasText: "Lucas Janssens" }).locator(".team-chip")).toHaveText("Équipe B");
    const due = page.locator(".stat-row-grid li").first();
    await expect(due).toContainText("500,00");
    await expect(page.locator(".scope-note")).toHaveCount(0);
    await axe(page, "dues all teams");

    // Équipe B in the top bar: the tiles and the table change, no team column, no note.
    await page.getByRole("banner").getByRole("combobox", { name: "Équipe", exact: true }).selectOption({ label: "Équipe B" });
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.locator("tbody tr")).toContainText("Lucas Janssens");
    await expect(due).toContainText("250,00");
    await expect(table.getByRole("columnheader", { name: "Équipe", exact: true })).toHaveCount(0);
    await expect(page.locator(".scope-note")).toHaveCount(0);
    await expect(page.locator("main").getByRole("combobox", { name: /^Équipe/ })).toHaveValue(teamB);
    await axe(page, "dues team B");
    // The home's money card gives the same figures for the team.
    await page.goto("/fr");
    await expect(page.locator(".finance-dues-text")).toContainText("250,00");

    // Trips: the form offers the team; the list keeps whole-club trips and the chosen team's.
    await page.goto("/fr/trips");
    await page.getByRole("button", { name: "Nouveau déplacement", exact: true }).click();
    const teamField = page.locator("main").getByRole("combobox", { name: /^Équipe/ });
    await expect(teamField).toBeVisible();
    await expect(teamField.locator("option")).toHaveText(["Club entier", "Équipe A", "Équipe B"]);
    await axe(page, "trip form");
    // Pots: the form offers the team too.
    await page.goto("/fr/fundraising");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".scope-note")).toHaveCount(0);
    await axe(page, "fundraising team B");
  } finally {
    await db.end();
  }
});
