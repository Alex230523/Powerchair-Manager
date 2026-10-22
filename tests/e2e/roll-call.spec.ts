import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (J2): « Appel », one session at a time: the answer on each line,
 * a full roll call with the keyboard, a click undone, « Tout présent »,
 * « En retard », closing and a traced correction; then « Statistiques » with
 * « Excusé » counted apart.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("roll call: answers, keyboard, undo, all present, late, closing, correction, statistics", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `j2-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "J2 présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('J2 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Les Aigles') RETURNING id", [club, season])).rows[0].id;
    const ids: Record<string, string> = {};
    for (const name of ["Ana Martin", "Bilal Haddad", "Chloé Peeters"]) {
      ids[name] = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2010-01-01' FROM p RETURNING id", [club, name])).rows[0].id;
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, team, ids[name]]);
    }
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    async function session(title: string, daysAgo: number, actual: Record<string, string>, closed: boolean, response: Record<string, string> = {}) {
      const event = (
        await db.query(
          `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
           VALUES($1,$2,$3,$4,'training','Europe/Brussels',now()-make_interval(days => $5)-interval '2 hours',now()-make_interval(days => $5)-interval '1 hour','2026-10-01T18:00','2026-10-01T20:00',$6,$7,'team') RETURNING id`,
          [club, series, daysAgo + 1, title, daysAgo, team, user],
        )
      ).rows[0].id;
      const register = (
        await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,minimum,closed_at,closed_by) VALUES($1,$2,now()-make_interval(days => $3+1),0,$4,$5) RETURNING id", [
          club,
          event,
          daysAgo,
          closed ? new Date() : null,
          closed ? user : null,
        ])
      ).rows[0].id;
      for (const name of Object.keys(ids))
        await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,actual,response) VALUES($1,$2,$3,$4,$5)", [club, register, ids[name], actual[name] ?? "unchecked", response[name] ?? "none"]);
      return register;
    }
    // Last week, closed: Bilal had announced his absence (« Excusé »).
    await session("Entraînement du 15", 7, { "Ana Martin": "present", "Bilal Haddad": "excused", "Chloé Peeters": "absent" }, true);
    const today = await session("Entraînement du jour", 0, {}, false, { "Ana Martin": "present", "Bilal Haddad": "absent" });
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. « Appel » first, the latest session, the answers on the lines.
    await page.goto("/fr/attendance");
    await expect(page.getByRole("tab", { name: "Appel" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Entraînement du jour" })).toBeVisible();
    const pills = page.getByRole("group", { name: "Séance" }).locator(".call-pill");
    await expect(pills).toHaveCount(2);
    await expect(pills.last()).toHaveAttribute("aria-pressed", "true");
    const row = (name: string) => page.locator(".call-row").filter({ hasText: name });
    await expect(row("Ana Martin")).toContainText("A répondu : présent");
    await expect(row("Bilal Haddad")).toContainText("A répondu : absent");
    await expect(row("Chloé Peeters")).toContainText("Pas de réponse");
    await expect(row("Ana Martin")).toContainText("Moyenne 100 %");
    await axe(page, "roll call");

    // 2. With the keyboard: arrows choose, each choice is saved.
    const ana = page.getByRole("radiogroup", { name: "Présence de Ana Martin" });
    await ana.getByRole("radio", { name: "Non pointé" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(ana.getByRole("radio", { name: "Présent" })).toHaveAttribute("aria-checked", "true");
    const bilal = page.getByRole("radiogroup", { name: "Présence de Bilal Haddad" });
    await bilal.getByRole("radio", { name: "Non pointé" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(bilal.getByRole("radio", { name: "Excusé" })).toHaveAttribute("aria-checked", "true");
    const actual = async (name: string) =>
      (await db.query("SELECT i.actual FROM attendance_invitation i WHERE i.register_id=$1 AND i.profile_id=$2", [today, ids[name]])).rows[0].actual;
    await expect.poll(() => actual("Ana Martin")).toBe("present");
    await expect.poll(() => actual("Bilal Haddad")).toBe("excused");

    // 3. A click, then « Annuler » in the message.
    const chloe = page.getByRole("radiogroup", { name: "Présence de Chloé Peeters" });
    await chloe.getByRole("radio", { name: "Absent" }).click();
    await expect.poll(() => actual("Chloé Peeters")).toBe("absent");
    await page.locator(".toast").getByRole("button", { name: "Annuler" }).click();
    await expect.poll(() => actual("Chloé Peeters")).toBe("unchecked");
    await expect(chloe.getByRole("radio", { name: "Non pointé" })).toHaveAttribute("aria-checked", "true");

    // 4. « Tout présent » marks the one left; « … » gives « En retard ».
    await page.getByRole("button", { name: "Tout présent" }).click();
    await expect(chloe.getByRole("radio", { name: "Présent" })).toHaveAttribute("aria-checked", "true");
    await row("Ana Martin").getByRole("button", { name: "Autres choix pour Ana Martin" }).click();
    await page.getByRole("button", { name: "En retard" }).click();
    await expect(row("Ana Martin").locator(".badge").filter({ hasText: "En retard" })).toBeVisible();
    await expect.poll(() => actual("Ana Martin")).toBe("late");

    // 5. Close, then a correction asks for its reason and is traced.
    await page.getByRole("button", { name: "Clôturer l'appel" }).click();
    await expect(page.getByText("Appel clôturé")).toBeVisible();
    await bilal.getByRole("radio", { name: "Présent" }).click();
    const fix = page.getByRole("dialog", { name: "Corriger après clôture : Bilal Haddad" });
    await fix.getByLabel("Motif de la correction").fill("Arrivé après l'appel");
    await axe(page, "correction");
    await fix.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect.poll(() => actual("Bilal Haddad")).toBe("present");
    expect((await db.query("SELECT reason FROM attendance_history WHERE register_id=$1 AND action='mark' ORDER BY created_at DESC LIMIT 1", [today])).rows[0].reason).toBe("Arrivé après l'appel");

    // 6. « Statistiques »: a card per player, « Excusé » apart.
    await page.getByRole("tab", { name: "Statistiques" }).click();
    const card = (name: string) => page.locator(".stat-card").filter({ hasText: name });
    await expect(card("Ana Martin")).toContainText("Entraînements : 2 / 2");
    await expect(card("Ana Martin").locator(".stat-card-rate")).toContainText("100 %");
    await expect(card("Bilal Haddad")).toContainText("Entraînements : 1 / 2");
    await expect(card("Bilal Haddad")).toContainText("Excusé(s) : 1");
    await expect(card("Chloé Peeters").locator(".stat-card-rate")).toContainText("50 %");
    await page.getByRole("button", { name: "Nom", exact: true }).click();
    await expect(page.locator(".stat-card strong").first()).toHaveText("Ana Martin");
    await axe(page, "statistics");

    // 7. At 390 px: icons alone, names kept, nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Appel" }).click();
    await expect(page.getByRole("radiogroup", { name: "Présence de Ana Martin" }).getByRole("radio", { name: "Présent" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "roll call 390");
    await page.screenshot({ path: "test-results/roll-call-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
