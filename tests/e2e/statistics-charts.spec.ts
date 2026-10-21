import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (2.6): the statistics charts. Lines per team and for the club, the
 * legend with the keyboard, the table view, the headcount per season with the
 * retention rate, the axes in light and dark, 390 and 320 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("statistics: monthly lines, legend, table view, headcount per season", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `charts-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Charts president");
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
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Charts club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    // Two seasons: last year one team of three, this year two coloured teams of five.
    const past = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison passée',CURRENT_DATE-500,CURRENT_DATE-136) RETURNING id", [club])).rows[0].id;
    const now = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison en cours',CURRENT_DATE-135,CURRENT_DATE+230) RETURNING id", [club])).rows[0].id;
    const team = async (season: string, name: string, color: string | null, category: string) =>
      (await db.query("INSERT INTO team(organization_id,season_id,name,color,category) VALUES($1,$2,$3,$4,$5) RETURNING id", [club, season, name, color, category])).rows[0].id as string;
    const old = await team(past, "Lions", "blue", "Senior"),
      lions = await team(now, "Lions", "blue", "Senior"),
      eagles = await team(now, "Aigles", "amber", "Jeunes");
    const people: string[] = [];
    for (const name of ["Ana", "Ben", "Chloé", "David", "Eva"])
      people.push(
        (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2000-01-01','{player}' FROM p RETURNING id", [club, name])).rows[0].id,
      );
    const member = (t: string, p: string) => db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')", [club, t, p]);
    for (const p of people.slice(0, 3)) await member(old, p);
    for (const p of people.slice(0, 3)) await member(lions, p);
    for (const p of people.slice(2)) await member(eagles, p);
    // Closed trainings today, 30 and 60 days ago for each team.
    for (const [t, results] of [
      [lions, ["present", "present", "absent"]],
      [eagles, ["present", "late", "absent"]],
    ] as const)
      for (const days of [0, 30, 60]) {
        const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
        const event = (
          await db.query(
            `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
             SELECT $1,$2,1,'Entraînement','training','Europe/Brussels',x.s,x.s+interval '2 hours',
                    to_char(x.s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((x.s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$3,$5,'team'
               FROM (SELECT ((CURRENT_DATE-$4::int)+time '18:30') AT TIME ZONE 'Europe/Brussels' AS s) x RETURNING id`,
            [club, series, t, days, user],
          )
        ).rows[0].id;
        const reg = (
          await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now()-($3::int||' days')::interval,now()-(($3::int-1)||' days')::interval,$4) RETURNING id", [club, event, days, user])
        ).rows[0].id;
        const who = t === lions ? people.slice(0, 3) : people.slice(2);
        for (const [i, p] of who.entries())
          await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,'present',$4)", [club, reg, p, results[i]]);
      }
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Monthly lines: one per team and the club.
    await page.goto("/fr/statistics");
    const monthly = page.locator("#stats-monthly");
    const chart = monthly.getByRole("group", { name: /^Assiduité par mois/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("aria-label", /Club : 67 %/);
    await expect(chart.locator("svg path")).toHaveCount(3);
    for (const name of ["Aigles", "Lions", "Club"]) await expect(monthly.getByRole("checkbox", { name })).toBeChecked();
    // Axis text in --muted, in light theme.
    const light = await chart.locator("svg text").first().evaluate((e) => getComputedStyle(e).fill);
    await axe(page, "statistics charts");

    // 2. The legend with the keyboard hides a line; the arrows go through the months.
    await monthly.getByRole("checkbox", { name: "Aigles" }).focus();
    await page.keyboard.press("Space");
    await expect(monthly.getByRole("checkbox", { name: "Aigles" })).not.toBeChecked();
    await expect(chart.locator("svg path")).toHaveCount(2);
    await page.keyboard.press("Space");
    await expect(chart.locator("svg path")).toHaveCount(3);
    await chart.focus();
    await page.keyboard.press("End");
    await expect(chart.locator(".chart-tooltip")).toContainText("Club");
    await expect(chart.locator("[aria-live]")).toContainText("Club 67 %");

    // 3. The same figures as a table.
    await monthly.getByRole("group", { name: "Voir les données" }).getByRole("button", { name: "Tableau" }).click();
    const table = monthly.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Club" })).toBeVisible();
    await expect(table.getByRole("row").last()).toContainText("67 %");
    await monthly.getByRole("group", { name: "Voir les données" }).getByRole("button", { name: "Graphique" }).click();

    // 4. A team chosen: its line and the club's average dashed.
    await page.locator("#stats-team").selectOption(lions);
    await page.getByRole("button", { name: "Afficher", exact: true }).click();
    await expect(monthly.getByRole("checkbox", { name: "Moyenne du club" })).toBeVisible();
    await expect(chart.locator("svg path[stroke-dasharray]")).toHaveCount(1);

    // 5. Headcount per season, by team then by category, and the retention rate.
    const headcount = page.locator("#stats-headcount");
    const bars = headcount.getByRole("group", { name: /^Effectif par saison/ });
    await expect(bars).toHaveAttribute("aria-label", /Saison passée 3 joueurs, Saison en cours 5 joueurs/);
    await expect(bars.locator("svg rect")).toHaveCount(3);
    await headcount.getByRole("group", { name: "Répartition" }).getByRole("button", { name: "Par catégorie" }).click();
    await expect(headcount.getByRole("checkbox", { name: "Jeunes" })).toBeVisible();
    await expect(page.locator(".stat-card").filter({ hasText: "Taux de fidélisation" })).toContainText("100 %");
    await axe(page, "headcount");

    // 6. Dark theme: the axes follow.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/fr/statistics");
    const dark = await page.locator("#stats-monthly .chart svg text").first().evaluate((e) => getComputedStyle(e).fill);
    expect(dark).not.toBe(light);
    await axe(page, "statistics dark");
    await page.emulateMedia({ colorScheme: "light" });

    // 7. Phone widths: nothing sticks out.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/fr/statistics");
      await expect(page.locator("#stats-monthly .chart")).toBeVisible();
      await noOverflow(page);
    }
  } finally {
    await db.end();
  }
});
