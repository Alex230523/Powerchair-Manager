import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 13/11/2026: the coaches give their attendance at the trainings. A coach
 * says « Présent » from his home, changes his mind in « Mes prochaines
 * séances » on the attendance page, and finds himself under « Coachs » in
 * today's roll call, apart from his players. At 390 px nothing sticks out.
 * Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a coach gives his attendance: from the home, from the attendance page, apart in the roll call", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(150000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `coach-att-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Coach Léo", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id", [`Club coachs ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Les Aigles') RETURNING id", [club, season])).rows[0].id;
    const coach = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,(SELECT id FROM person WHERE user_id=$2),'Coach Léo','{coach}') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [club, team, coach]);
    const people = [coach];
    for (const name of ["Ana Martin", "Bilal Haddad"]) {
      const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2010-01-01' FROM p RETURNING id", [club, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, id]);
      people.push(id);
    }
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    /** A training `hours` from now (negative: started), its register open, everyone invited. */
    async function training(title: string, ordinal: number, hours: number) {
      const event = (
        await db.query(
          `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
           VALUES($1,$2,$3,$4,'training','Europe/Brussels',now()+make_interval(hours => $5),now()+make_interval(hours => $5+2),'2026-11-14T18:00','2026-11-14T20:00',$6,$7,'team') RETURNING id`,
          [club, series, ordinal, title, hours, team, user],
        )
      ).rows[0].id;
      const register = (
        await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,minimum) VALUES($1,$2,now()+make_interval(hours => GREATEST($3-2,-1)),0) RETURNING id", [club, event, hours])
      ).rows[0].id;
      for (const p of people) await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id) VALUES($1,$2,$3)", [club, register, p]);
      return register;
    }
    const tomorrow = await training("Entraînement de demain", 1, 26);
    // Started three hours ago, over an hour ago: in the roll call, no longer « next » on the home.
    await training("Entraînement du jour", 2, -3);
    const mine = async (register: string) => (await db.query("SELECT response FROM attendance_invitation WHERE register_id=$1 AND profile_id=$2", [register, coach])).rows[0].response as string;

    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The home: « Ma présence » under the next training.
    await page.goto("/fr");
    const own = page.getByRole("group", { name: "Ma présence : Entraînement de demain" });
    await expect(own).toBeVisible({ timeout: 15000 });
    await own.getByRole("button", { name: "Présent" }).click();
    await expect.poll(() => mine(tomorrow)).toBe("present");
    await expect(own.getByRole("button", { name: "Présent" })).toHaveAttribute("aria-pressed", "true");
    await axe(page, "home");

    // 2. The attendance page: « Mes prochaines séances », the coach changes his mind.
    await page.goto("/fr/attendance");
    const next = page.locator(".my-next");
    await expect(next.getByRole("heading", { name: "Mes prochaines séances" })).toBeVisible();
    const line = next.getByRole("group", { name: /^Ma présence : Entraînement de demain/ });
    await expect(line.getByRole("button", { name: "Présent" })).toHaveAttribute("aria-pressed", "true");
    await line.getByRole("button", { name: "Absent" }).click();
    await expect.poll(() => mine(tomorrow)).toBe("absent");
    await expect(line.getByRole("button", { name: "Absent" })).toHaveAttribute("aria-pressed", "true");

    // 3. Today's roll call: the players, then « Coachs ».
    await expect(page.getByRole("heading", { name: "Entraînement du jour" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Joueurs" }).locator(".call-row")).toHaveCount(2);
    await expect(page.getByRole("list", { name: "Coachs" }).locator(".call-row")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Coachs" })).toContainText("Coach Léo");
    await axe(page, "attendance");

    // At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/attendance");
    await expect(page.locator(".my-next")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "attendance 390");
  } finally {
    await db.end();
  }
});
