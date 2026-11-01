import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 16 (S1): the « Club » tab of the statistics. Tabs, tiles, the « ... »
 * menu and its period kept in the address, months and weeks, the Age view,
 * the result rings with their text, the storage, a prize added from a
 * tournament and by hand; axe in light and dark, 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("statistics, Club tab: tiles, periods, weeks, ages, rings, storage and Hall of fame", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `stats-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Stats president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Stats club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    // Two seasons: last year the Lions with three players, this year the Lions and the Aigles, five players.
    const past = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-26',CURRENT_DATE-500,CURRENT_DATE-136) RETURNING id", [club])).rows[0].id;
    const now = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-135,CURRENT_DATE+230) RETURNING id", [club])).rows[0].id;
    const team = async (season: string, name: string, color: string) =>
      (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,$3,$4) RETURNING id", [club, season, name, color])).rows[0].id as string;
    const old = await team(past, "Lions", "blue"),
      lions = await team(now, "Lions", "blue"),
      eagles = await team(now, "Aigles", "amber");
    const people: string[] = [];
    for (const name of ["Ana", "Ben", "Chloé", "David", "Eva"])
      people.push(
        (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2000-01-01','{player}' FROM p RETURNING id", [club, name])).rows[0].id,
      );
    const member = (t: string, p: string) => db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-200)", [club, t, p]);
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
               FROM (SELECT ((CURRENT_DATE-$4::int)+time '08:30') AT TIME ZONE 'Europe/Brussels' AS s) x RETURNING id`,
            [club, series, t, days, user],
          )
        ).rows[0].id;
        const reg = (
          await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now(),now(),$3) RETURNING id", [club, event, user])
        ).rows[0].id;
        const who = t === lions ? people.slice(0, 3) : people.slice(2);
        for (const [i, p] of who.entries())
          await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,'present',$4)", [club, reg, p, results[i]]);
      }
    // The Lions won one match and lost one; a tournament ended second.
    for (const [our, their] of [
      [3, 1],
      [0, 2],
    ])
      await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Gand','league',now()-interval '20 days','played',$3,$4,$5)", [
        club,
        lions,
        our,
        their,
        user,
      ]);
    await db.query(
      "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,team_id,final_rank,teams_count,created_by) VALUES($1,'Tournoi de Gand','tournament',CURRENT_DATE-12,CURRENT_DATE-11,$2,2,8,$3)",
      [club, lions, user],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. /statistics opens the Club tab: header, tabs, tiles, no filter bar.
    await page.goto("/fr/statistics");
    await expect(page).toHaveURL(/\/fr\/statistics\/club$/);
    await expect(page.getByRole("heading", { name: "Statistiques", exact: true })).toBeVisible();
    await expect(page.locator(".page-subtitle")).toHaveText("Saison 2026-27 · toutes les équipes");
    await expect(page.getByRole("navigation", { name: "Onglets des statistiques" }).getByRole("link", { name: "Club" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Onglets des statistiques" }).getByRole("link", { name: "Jeu" })).not.toHaveAttribute("aria-current");
    await expect(page.locator(".stat-card").filter({ hasText: "Joueurs" })).toContainText("5");
    await expect(page.locator(".stat-card").filter({ hasText: "Matchs" })).toContainText("2");
    await expect(page.locator(".stat-card").filter({ hasText: "Solde total" })).toBeVisible();
    await expect(page.locator(".statistics-filters")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Gérer les présences" })).toHaveCount(0);

    // 2. Attendance: one line per team and the club; by week, « sem. » labels.
    const attendance = page.locator("#stats-attendance");
    const chart = attendance.getByRole("group", { name: /^Taux de présence/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator("svg path")).toHaveCount(3);
    await expect(attendance.getByRole("checkbox", { name: "Club" })).toBeChecked();
    await attendance.getByRole("group", { name: "Pas de temps" }).getByRole("button", { name: "Par semaine" }).click();
    await expect(chart.locator("svg text").filter({ hasText: /^sem\. \d+$/ }).first()).toBeVisible();
    const light = await chart.locator("svg text").first().evaluate((e) => getComputedStyle(e).fill);
    await axe(page, "statistics club");

    // 3. The « ... » menu: a period kept in the address, the data, the exports.
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    const menu = attendance.getByRole("group", { name: "Options du graphique" });
    await expect(menu.getByRole("radio", { name: "Saison en cours" })).toBeChecked();
    await axe(page, "chart menu");
    // Choosing a period applies it and closes the menu.
    await menu.getByRole("radio", { name: "3 dernières saisons" }).click();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/p-attendance=last3/);
    await expect(attendance.locator(".card-subtitle")).toHaveText("Saisons 2025-26 à 2026-27");
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    await menu.getByRole("button", { name: "Voir les données" }).click();
    await expect(attendance.getByRole("table").getByRole("columnheader", { name: "Club" })).toBeVisible();
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    const csv = page.waitForEvent("download");
    await menu.getByRole("button", { name: "Exporter en CSV" }).click();
    expect((await csv).suggestedFilename()).toBe("evolution-des-presences.csv");
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    await menu.getByRole("button", { name: "Voir le graphique" }).click();
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    const image = page.waitForEvent("download");
    await menu.getByRole("button", { name: "Exporter en image PNG" }).click();
    expect((await image).suggestedFilename()).toBe("evolution-des-presences.png");
    // Escape closes the menu and gives the focus back.
    await attendance.getByRole("button", { name: "Options du graphique" }).click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(attendance.getByRole("button", { name: "Options du graphique" })).toBeFocused();
    // The period survives a reload.
    await page.reload();
    await expect(page.locator("#stats-attendance .card-subtitle")).toHaveText("Saisons 2025-26 à 2026-27");

    // 4. Headcount: grouped bars per team over five seasons, then the Age view.
    const headcount = page.locator("#stats-headcount");
    const bars = headcount.getByRole("group", { name: /^Effectif par saison/ });
    await expect(bars).toHaveAttribute("aria-label", /2025-26 3 personnes, 2026-27 5 personnes/);
    await expect(bars.locator("svg rect[rx]")).toHaveCount(3);
    await headcount.getByRole("group", { name: "Vue" }).getByRole("button", { name: "Âge" }).click();
    await expect(headcount.getByRole("checkbox", { name: "26 à 40" })).toBeVisible();
    await expect(headcount.getByText("Âge au 1er septembre de la saison.")).toBeVisible();

    // 5. Rings: wins and losses in words, a grey ring without a match.
    const results = page.locator("#stats-results");
    await expect(results.locator("li").filter({ hasText: "Lions" })).toContainText("1 victoire(s) · 0 nul(s) · 1 défaite(s)");
    await expect(results.locator("li").filter({ hasText: "Aigles" })).toContainText("Aucun match joué");
    await expect(results.locator("li").filter({ hasText: "Lions" }).locator("svg .donut-total")).toHaveText("2");
    const ring = results.getByRole("link", { name: "Voir les matchs de Lions : 1 victoire(s) · 0 nul(s) · 1 défaite(s)" });
    await expect(ring).toHaveAttribute("href", new RegExp(`/fr/statistics/game\\?season=${now}&team=${lions}$`));

    // 6. Storage, for the president.
    await expect(page.locator("#stats-storage")).toContainText(/utilisés sur 1 Go/);

    // 7. Hall of fame: the tournament suggested, added once confirmed; a prize by hand.
    const hall = page.locator("#hall-of-fame");
    await expect(hall.getByText("2e place au tournoi « Tournoi de Gand »")).toBeVisible();
    await hall.getByRole("button", { name: "Ajouter au Hall of fame" }).click();
    const form = page.getByRole("dialog", { name: "Ajouter un prix" });
    await expect(form.getByLabel("Titre", { exact: true })).toHaveValue("Tournoi de Gand");
    await axe(page, "award form");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Prix enregistré.")).toBeVisible();
    await expect(hall.getByText("2e place au tournoi « Tournoi de Gand »")).toHaveCount(0);
    await hall.getByRole("button", { name: "Ajouter un prix" }).click();
    await form.getByLabel("Titre", { exact: true }).fill("Champion de Belgique D2");
    await form.getByLabel("Date", { exact: true }).fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()));
    await form.getByRole("button", { name: "Enregistrer" }).click();
    const prize = hall.getByRole("article", { name: "Champion de Belgique D2" });
    await expect(prize).toContainText("1re place");
    await expect(hall.getByRole("article", { name: "Tournoi de Gand" })).toContainText("2e place");
    await expect(hall.getByRole("heading", { name: "2026-27", level: 3 })).toBeVisible();
    const total = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    expect((await total).suggestedFilename()).toBe("statistics-2026-27.csv");

    // 8. Dark theme: the axes follow; axe again.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/fr/statistics/club");
    const dark = await page.locator("#stats-attendance .chart svg text").first().evaluate((e) => getComputedStyle(e).fill);
    expect(dark).not.toBe(light);
    await axe(page, "statistics dark");
    await page.emulateMedia({ colorScheme: "light" });

    // 9. 390 px: one column, nothing sticks out.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/fr/statistics/club");
    await expect(page.locator("#stats-attendance .chart")).toBeVisible();
    await expect(page.locator("#hall-of-fame")).toContainText("Champion de Belgique D2");
    await noOverflow(page);
    await axe(page, "statistics 390");
  } finally {
    await db.end();
  }
});
