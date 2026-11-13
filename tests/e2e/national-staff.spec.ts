import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 13/11/2026: « Mon équipe nationale ». A club's coach on the staff of a
 * national team finds it in the menu, reads his players, their answers and
 * the gathering, then asks for the care instructions (none shared here). At
 * 390 px nothing sticks out. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a coach on a national staff: the menu entry, his team, the gathering, the care instructions on demand", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(150000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `natstaff-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Coach Léo", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'federation') RETURNING id", [`Fédé ${stamp}`])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES($1,'club',$2) RETURNING id", [`Club national ${stamp}`, fed])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach') RETURNING id", [club, user])).rows[0].id;
    const coach = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,(SELECT id FROM person WHERE user_id=$2),'Coach Léo','{coach}') RETURNING id", [club, user])).rows[0].id;
    // A national team has an organisation of its own (a tournament participant).
    const own = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'guest') RETURNING id", [`Belgique U18 ${stamp}`])).rows[0].id;
    const team = (await db.query("INSERT INTO national_team(federation_id,organization_id,name,category,season,created_by) VALUES($1,$2,$3,'u18','2026-27',$4) RETURNING id", [fed, own, `Belgique U18 ${stamp}`, user])).rows[0].id;
    await db.query("INSERT INTO national_team_staff(team_id,role,profile_id,name) VALUES($1,'head_coach',$2,'Coach Léo')", [team, coach]);
    const selections: string[] = [];
    for (const [name, status] of [
      ["Léa Martin", "selected"],
      ["Tom Peeters", "reserve"],
    ]) {
      const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,$2,'2009-01-01','{player}' FROM p RETURNING id", [club, name])).rows[0].id;
      selections.push((await db.query("INSERT INTO national_selection(team_id,profile_id,club_id,status,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [team, id, club, status, user])).rows[0].id);
    }
    const gathering = (
      await db.query("INSERT INTO national_gathering(team_id,kind,title,starts_at,ends_at,place,created_by) VALUES($1,'camp','Stage de Toussaint',now()+interval '10 days',now()+interval '12 days','Bruxelles',$2) RETURNING id", [team, user])
    ).rows[0].id;
    for (const s of selections) await db.query("INSERT INTO national_gathering_answer(gathering_id,selection_id,response) VALUES($1,$2,$3)", [gathering, s, s === selections[0] ? "present" : "none"]);

    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // The menu entry, then the page.
    await page.getByRole("link", { name: "Mon équipe nationale" }).first().click();
    await expect(page.getByRole("heading", { name: "Mon équipe nationale", level: 1 })).toBeVisible();
    const card = page.locator(".national-staff-team").filter({ hasText: `Belgique U18 ${stamp}` });
    await expect(card).toContainText("Votre rôle : Coach principal");
    await expect(card.locator("tbody tr")).toHaveCount(2);
    await card.getByText("Présents : 1, absents : 0, sans réponse : 1").click();
    await expect(card.getByRole("list", { name: "Qui vient : Stage de Toussaint" })).toContainText("Léa Martin");
    await axe(page, "national staff");

    // Care instructions on demand: none shared, nothing journaled.
    await card.getByRole("button", { name: "Afficher les consignes de soin" }).click();
    await expect(card.getByText("Aucune consigne partagée en ce moment.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Masquer les consignes de soin" })).toHaveAttribute("aria-expanded", "true");
    expect((await db.query("SELECT count(*)::int AS n FROM sensitive_access_log WHERE actor_id=$1", [user])).rows[0].n).toBe(0);
    await axe(page, "national staff care");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/national");
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "national staff 390");
  } finally {
    await db.end();
  }
});
