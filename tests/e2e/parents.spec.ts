import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 27 to 29 on a phone (390 px): a parent of two children opens « Ma
 * famille », answers « Présents tous les deux », changes one child, sees who
 * answered, keeps one child with the switcher (remembered on the calendar),
 * and finds the authorization to sign. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("a parent of two children on a phone", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `parents-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Nadia Parent", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des familles','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const president = (await db.query("SELECT id FROM \"user\" WHERE id<>$1 LIMIT 1", [user])).rows[0]?.id ?? user;
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'guardian') RETURNING id", [club, user])).rows[0].id as string;
    const person = (await db.query("SELECT id FROM person WHERE user_id=$1", [user])).rows[0]?.id ?? (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [user])).rows[0].id;
    const me = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Nadia Parent') RETURNING id", [club, person])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
    const kids: string[] = [];
    for (const name of ["Lucas Martin", "Emma Martin"]) {
      const p = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      const k = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2014-03-01','{player}') RETURNING id", [club, p, name])).rows[0].id;
      kids.push(k);
      await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, k]);
      await db.query(
        "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
        [club, me, k, president],
      );
    }
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    const event = (
      await db.query(
        "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement du mercredi','training','Europe/Brussels',now()+interval '4 days',now()+interval '4 days 2 hours','2026-11-06T18:00','2026-11-06T20:00',$3,$4,'organization') RETURNING id",
        [club, series, team, user],
      )
    ).rows[0].id;
    const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '3 days') RETURNING id", [club, event])).rows[0].id;
    for (const k of kids) await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id) VALUES($1,$2,$3)", [club, register, k]);
    // An authorization waiting for her signature.
    const doc = (await db.query("INSERT INTO club_document(organization_id,profile_id,season_id,name,category,status) VALUES($1,$2,$3,'Autorisation de déplacement','consent','requested') RETURNING id", [club, kids[0], season])).rows[0].id;
    await db.query("INSERT INTO authorization_request(organization_id,kind,profile_id,season_id,document_id,requested_by) VALUES($1,'travel',$2,$3,$4,$5)", [club, kids[0], season, doc, user]);

    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/family");
    await expect(page.getByRole("heading", { name: "Ma famille", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entraînement du mercredi" })).toBeVisible();
    await axe(page, "family");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // One answer for both, then Lucas changed alone.
    await page.getByRole("button", { name: "Présents tous les deux" }).click();
    await expect(page.locator(".family-child-line .badge")).toHaveText(["Présent", "Présent"]);
    await expect(page.getByText("Réponse de Nadia Parent").first()).toBeVisible();
    await page.getByRole("button", { name: "Absent pour Lucas" }).click();
    await expect(page.locator(".family-child-line").filter({ hasText: "Lucas" }).locator(".badge")).toHaveText("Absent");
    await expect(page.locator(".family-child-line").filter({ hasText: "Emma" }).locator(".badge")).toHaveText("Présent");

    // Lucas's authorization, with its buttons.
    await expect(page.getByText("Autorisation de déplacement et de transport")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lire et signer" })).toBeVisible();
    await axe(page, "family answered");

    // The switcher keeps Emma, and the calendar remembers it.
    await page.getByRole("group", { name: "Afficher" }).getByRole("button", { name: "Emma" }).click();
    await expect(page.locator(".family-child-line")).toHaveCount(1);
    await expect(page.getByText("Autorisation de déplacement et de transport")).toHaveCount(0);
    await page.goto("/fr/calendar");
    await expect(page.getByRole("group", { name: "Afficher" }).getByRole("button", { name: "Emma" })).toHaveAttribute("aria-pressed", "true");
    await axe(page, "calendar with a child kept");
    await page.screenshot({ path: "test-results/parents-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
