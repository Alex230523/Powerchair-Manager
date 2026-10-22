import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 14: the president's home. Header with the season and the "Créer" menu,
 * to-do cards, the agenda as a list or a week, the figures and the money card.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map(
    (v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(violations, label).toEqual([]);
}
/** Local Brussels time, "YYYY-MM-DDTHH:MM", some minutes from now. */
function localIn(minutes: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(
    new Date(Date.now() + minutes * 60000),
  );
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

test("president's home: header, Créer, to-dos, list and week, figures and money", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `home-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Alexandre Accueil", email, "Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
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
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Home club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe A','teal') RETURNING id", [club, season])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);

    // An event two hours from now (today, inside the current week), created through the real API.
    const created = await page.request.post("/api/calendar", {
      headers: { origin },
      data: {
        organizationId: club,
        action: "create",
        requestId: crypto.randomUUID(),
        title: "Entraînement accueil",
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: localIn(120),
        localEnd: localIn(150),
        fold: "reject",
        teamId: team,
        placeId: null,
        responsibleId: user,
        visibility: "organization",
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
      },
    });
    expect(created.status()).toBe(200);
    const eventId = (await created.json()).id as string;

    // Header: greeting, date and season, Statistiques and Créer.
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: "Bonjour Alexandre", exact: true })).toBeVisible();
    await expect(page.locator(".page-subtitle")).toContainText("Saison 2026-27");
    await expect(page.getByRole("link", { name: "Statistiques", exact: true })).toBeVisible();
    const create = page.getByRole("button", { name: "Créer", exact: true });
    await create.click();
    const menu = page.getByRole("menu", { name: "Créer" });
    for (const name of ["Événement", "Joueur", "Opération financière", "Mail"]) await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    await axe(page, "home with the create menu");
    await menu.getByRole("menuitem", { name: "Événement", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/calendar\?create=1$/);
    await expect(page.locator("#event-editor")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Créer un événement", exact: true })).toBeVisible();

    // Agenda: the list by default, the week on demand; a capsule opens the event's sheet.
    await page.goto("/fr");
    const agenda = page.getByRole("region", { name: "Prochains événements" });
    await expect(agenda.getByRole("link", { name: /Entraînement accueil/ })).toBeVisible();
    await agenda.getByRole("group", { name: "Affichage des événements" }).getByRole("button", { name: "Semaine", exact: true }).click();
    await expect(agenda.locator(".week-day")).toHaveCount(7);
    await expect(agenda.locator(".week-day[data-today]")).toHaveCount(1);
    const capsule = agenda.getByRole("link", { name: /Entraînement accueil/ });
    await expect(capsule).toBeVisible();
    await expect(capsule).toHaveAttribute("data-color", "teal");
    await agenda.getByRole("button", { name: "Semaine suivante", exact: true }).click();
    await expect(agenda.getByRole("link", { name: /Entraînement accueil/ })).toHaveCount(0);
    await agenda.getByRole("button", { name: "Aujourd'hui", exact: true }).click();
    await expect(capsule).toBeVisible();
    await axe(page, "home week view");
    await capsule.click();
    await expect(page).toHaveURL(new RegExp(`/fr/calendar\\?event=${eventId}$`));

    // Figures and the money card.
    await page.goto("/fr");
    const figures = page.getByRole("region", { name: "Chiffres clés" });
    // Wave 16 (A): the president's seven key figures, the treasury first.
    await expect(figures.locator(".stat-card")).toHaveCount(7);
    await expect(figures.locator(".stat-card").first()).toContainText("Trésorerie");
    await figures.getByRole("button", { name: "Tous les chiffres", exact: true }).click();
    expect(await figures.locator(".stat-card").count()).toBeGreaterThan(7);
    const money = page.getByRole("region", { name: "Situation financière" });
    await expect(money).toContainText("Trésorerie");
    await expect(money).toContainText("Aucune cotisation émise cette saison.");
    await expect(money.getByRole("link", { name: "Voir les finances", exact: true })).toHaveAttribute("href", "/fr/funding");

    // Phone width: the to-dos stack and nothing overflows.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: "Bonjour Alexandre", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await axe(page, "home 390");
  } finally {
    await db.end();
  }
});
