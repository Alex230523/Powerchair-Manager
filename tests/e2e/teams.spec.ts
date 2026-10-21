import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 12: the president of a club with two teams picks "Équipe B" once in
 * the top bar, the players page and the calendar keep that choice; then
 * "Mes équipes": a new team with its colour, the team sheet, a player moved
 * to another team. Every screen passes the axe WCAG 2.2 AA checks.
 */
const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(tags);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function loaded(page: Page, path: string) {
  await expect(page.locator("main h1").first(), path).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/^Chargement/)).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText(/Page indisponible|Cette page est réservée/), path).toHaveCount(0);
  await expect(page.locator("main [role=alert]"), path).toHaveCount(0);
}

test("the team chosen in the top bar follows the president; teams are created, coloured and moved", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(300000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `teams-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Teams test president");
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
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Teams club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (
      await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])
    ).rows[0].id;
    const season = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id",
        [club],
      )
    ).rows[0].id;
    const team = async (name: string, color: string) =>
      (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,$3,$4) RETURNING id", [club, season, name, color])).rows[0].id as string;
    const teamA = await team("Équipe A", "blue"),
      teamB = await team("Équipe B", "coral");
    const player = async (name: string, teamId: string) => {
      const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
      const id = (
        await db.query(
          "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2009-05-01','{player}') RETURNING id",
          [club, person, name],
        )
      ).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, teamId, id]);
      return id as string;
    };
    const emma = await player("Emma Peeters", teamA);
    await player("Lucas Peeters", teamA);
    await player("Yanis El Amrani", teamB);

    // The profile menu at the foot of the sidebar replaces the raw select of the top bar.
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // 1. Top bar: current season, "Équipe B" chosen once.
    await page.goto("/fr");
    await loaded(page, "/fr");
    const bar = page.locator(".scope-bar");
    await expect(bar.getByRole("combobox", { name: "Saison", exact: true })).toHaveValue(season);
    await bar.getByRole("combobox", { name: "Équipe", exact: true }).selectOption({ label: "Équipe B" });
    await expect(page).toHaveURL(/[?&]team=/);
    await expect(page.locator(".scope-chip")).toContainText("Équipe B");
    await axe(page, "dashboard with a team");
    // Players, then calendar: the local filter already holds the team.
    await page.goto("/fr/players");
    await loaded(page, "/fr/players");
    await expect(page.locator("#directory-team")).toHaveValue(teamB);
    await expect(page.locator(".scope-chip")).toContainText("Équipe B");
    await expect(page.locator("main")).toContainText("Yanis El Amrani");
    await expect(page.locator("main table")).not.toContainText("Emma Peeters");
    await axe(page, "players filtered");
    await page.goto("/fr/calendar");
    await loaded(page, "/fr/calendar");
    await expect(page.locator("#calendar-team")).toHaveValue(teamB);
    await expect(page.locator(".scope-chip")).toContainText("Équipe B");
    await axe(page, "calendar filtered");
    // A local change offers to apply it everywhere; the chip then goes away.
    await page.locator("#calendar-team").selectOption("");
    await page.getByRole("button", { name: "Appliquer à toute la plateforme", exact: true }).click();
    await expect(page.locator(".scope-chip")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]team=/);
    // A money page keeps a note when a team is chosen, none otherwise.
    await bar.getByRole("combobox", { name: "Équipe", exact: true }).selectOption({ label: "Équipe A" });
    await page.goto("/fr/dues");
    await loaded(page, "/fr/dues");
    await expect(page.locator(".scope-note")).toContainText("Vue club entière");
    await page.locator(".scope-chip .scope-clear").click();
    await expect(page.locator(".scope-note")).toHaveCount(0);

    // 2. Mes équipes: one card per team, a new team with its colour.
    await page.goto("/fr/teams");
    await loaded(page, "/fr/teams");
    await expect(page.getByRole("heading", { name: "Mes équipes", exact: true })).toBeVisible();
    await expect(page.locator(".team-card")).toHaveCount(2);
    await expect(page.locator(".team-card").filter({ hasText: "Équipe A" })).toContainText("2");
    await axe(page, "teams");
    await page.getByRole("button", { name: "Nouvelle équipe", exact: true }).click();
    const creation = page.getByRole("dialog", { name: "Nouvelle équipe" });
    await creation.getByLabel("Nom", { exact: true }).fill("Équipe C");
    await creation.getByLabel("Catégorie", { exact: true }).fill("Jeunes");
    await creation.getByRole("button", { name: "Prune", exact: true }).click();
    await expect(creation.getByRole("button", { name: "Prune", exact: true })).toHaveAttribute("aria-pressed", "true");
    await axe(page, "new team dialog", "dialog");
    await creation.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const cardC = page.locator(".team-card").filter({ hasText: "Équipe C" });
    await expect(cardC).toBeVisible();
    await expect(cardC).toHaveAttribute("data-color", "plum");
    expect((await db.query("SELECT color,category FROM team WHERE organization_id=$1 AND name='Équipe C'", [club])).rows[0]).toEqual({ color: "plum", category: "Jeunes" });

    // 3. The team sheet: roster, a player moved to Équipe B, the colour changed.
    await page.getByRole("link", { name: "Ouvrir la fiche de l'équipe : Équipe A", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/teams/${teamA}$`));
    await loaded(page, "/fr/teams/A");
    await expect(page.getByRole("tab", { name: "Effectif", exact: true })).toBeVisible();
    await expect(page.locator("main table")).toContainText("Emma Peeters");
    await axe(page, "team sheet");
    await page.getByRole("button", { name: "Déplacer vers… : Emma Peeters" }).click();
    const move = page.getByRole("dialog", { name: "Déplacer Emma Peeters" });
    await move.getByLabel("Équipe de destination").selectOption({ label: "Équipe B" });
    await axe(page, "move dialog", "dialog");
    await move.getByRole("button", { name: "Déplacer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Joueur déplacé." })).toBeVisible();
    await expect(page.locator("main table")).not.toContainText("Emma Peeters");
    const memberships = (
      await db.query(
        "SELECT t.name,(m.ends_on=CURRENT_DATE-1) AS closed_yesterday,(m.starts_on=CURRENT_DATE) AS from_today FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.profile_id=$1 AND NOT m.cancelled ORDER BY m.starts_on",
        [emma],
      )
    ).rows;
    expect(memberships).toEqual([
      { name: "Équipe A", closed_yesterday: true, from_today: false },
      { name: "Équipe B", closed_yesterday: null, from_today: true },
    ]);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='team.move' AND target_id=$1", [emma])).rows[0].n).toBe(1);
    await page.getByRole("tab", { name: "Réglages", exact: true }).click();
    await page.getByRole("button", { name: "Ambre", exact: true }).click();
    await axe(page, "team settings");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    expect((await db.query("SELECT color FROM team WHERE id=$1", [teamA])).rows[0].color).toBe("amber");
    // The calendar legend lists the teams with their colours.
    await page.goto("/fr/calendar");
    await loaded(page, "/fr/calendar");
    await expect(page.locator(".calendar-legend .team-dot[data-color=amber]")).toHaveCount(1);

    // Phone width: the cards stack and nothing overflows.
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto("/fr/teams");
    await loaded(page, "/fr/teams (360)");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await db.end();
  }
});
