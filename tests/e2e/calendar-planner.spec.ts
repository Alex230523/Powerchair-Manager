import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn, signUpVia } from "../support/session";

/**
 * Wave 15 (2.7 and C9): the week grid (an 18 h to 20 h training at its place,
 * an overlap side by side, the all-day band), the views with the keyboard,
 * colours by type, ?event=ID, the subscription window filtered by team with
 * renewal and revocation, the getting-started card of a player.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  const violations = (await (within ? builder.include(within) : builder).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("calendar: week grid, views, colours, event sheet and subscription", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const playerContext = await browser.newContext({ baseURL: origin }),
    playerPage = await playerContext.newPage(),
    anon = await browser.newContext();
  const email = `planner-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Planner president", email, "Browser-test-passphrase-2026!");
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
    await db.query('DELETE FROM "rateLimit"');
    const signup = await signUpVia(playerPage, db, {
      headers: { origin },
      data: { name: "Planner Player", email: `planner-player-${Date.now()}@example.test`, password: "Browser-test-passphrase-2026!" },
    });
    expect(signup.status()).toBe(200);
    const player = (await signup.json()).user.id as string;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Planner club','club') RETURNING id")).rows[0].id;
    const mandates: string[] = [];
    for (const [u, role] of [
      [user, "club_president"],
      [player, "player"],
    ]) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, u]);
      mandates.push((await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [club, u, role])).rows[0].id);
    }
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','teal') RETURNING id", [club, season])).rows[0].id;
    const person =
      (await db.query("SELECT id FROM person WHERE user_id=$1", [player])).rows[0]?.id ?? (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [player])).rows[0].id;
    const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Planner Player','2000-01-01','{player}') RETURNING id", [club, person])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')", [club, team, profile]);
    // Next Monday, in Brussels.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const monday = (() => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
      return d.toISOString().slice(0, 10);
    })();
    const event = async (title: string, kind: string, start: string, end: string, teamId: string | null) => {
      const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
      return (
        await db.query(
          `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
           VALUES($1,$2,1,$3,$4,'Europe/Brussels',($5::timestamp AT TIME ZONE 'Europe/Brussels'),($6::timestamp AT TIME ZONE 'Europe/Brussels'),$9,$10,$7,$8,'organization') RETURNING id`,
          [club, series, title, kind, start, end, teamId, user, start, end],
        )
      ).rows[0].id as string;
    };
    const training = await event("Entraînement Lions", "training", `${monday}T18:00`, `${monday}T20:00`, team);
    await event("Réunion du bureau", "meeting", `${monday}T19:00`, `${monday}T21:00`, null);
    const tuesday = new Date(Date.parse(monday + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    await event("Tournoi de printemps", "tournament", `${monday}T00:00`, `${tuesday}T00:00`, null);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandates[0])]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The views with the keyboard: from Mois, the left arrow selects Semaine.
    await page.goto("/fr/calendar");
    const views = page.getByRole("group", { name: "Vue", exact: true });
    await views.getByRole("button", { name: "Mois", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(views.getByRole("button", { name: "Semaine", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Date de référence", { exact: true }).fill(monday);

    // 2. The training from 18 h to 20 h at its place, the meeting beside it, the tournament in the band.
    const a = page.getByRole("button", { name: /^Entraînement Lions, lundi .* de 18 h à 20 h/ });
    await expect(a).toBeVisible();
    expect(await a.evaluate((e) => [getComputedStyle(e).top, getComputedStyle(e).height])).toEqual(["528px", "94px"]);
    const b = page.getByRole("button", { name: /^Réunion du bureau, lundi .* de 19 h à 21 h/ });
    const [boxA, boxB] = [await a.boundingBox(), await b.boundingBox()];
    expect(boxA && boxB && boxB.x > boxA.x + boxA.width - 4 && Math.abs(boxA.width - boxB.width) < 2).toBe(true);
    await expect(page.locator(".planner-allday").getByRole("button", { name: /^Tournoi de printemps, .* toute la journée/ })).toBeVisible();
    await expect(page.locator(".planner-dayhead")).toHaveCount(7);
    await axe(page, "week grid");
    // Arrows go from one event to the next.
    await a.focus();
    await page.keyboard.press("ArrowRight");
    await expect(b).toBeFocused();

    // 3. Colours by type: the training turns blue, the legend lists the types.
    await page.getByRole("group", { name: "Couleur par", exact: true }).getByRole("button", { name: "Type", exact: true }).click();
    await expect(a).toHaveAttribute("data-kind", "training");
    await expect(page.locator(".calendar-legend [data-kind=tournament]")).toHaveCount(1);
    await page.getByRole("group", { name: "Couleur par", exact: true }).getByRole("button", { name: "Équipe", exact: true }).click();
    await expect(a).toHaveAttribute("data-color", "teal");

    // 4. The sheet, from the grid and from ?event=ID.
    await a.click();
    const sheet = page.getByRole("dialog", { name: "Entraînement Lions" });
    await expect(sheet.getByRole("heading", { name: "Convocations et réponses" })).toBeVisible();
    await axe(page, "event sheet", "dialog[open]");
    await sheet.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await page.goto(`/fr/calendar?event=${training}`);
    await expect(page.getByRole("dialog", { name: "Entraînement Lions" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    // The list groups by day.
    await expect(page.locator(".planner-list-day").first()).toBeVisible();
    await axe(page, "list view");

    // 5. Subscription filtered by team: Google, Apple, Outlook, the QR code; renewed then revoked.
    await page.getByRole("button", { name: "S’abonner", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "S’abonner au calendrier" });
    await dialog.getByRole("radio", { name: "Une équipe" }).check();
    await dialog.getByRole("button", { name: "Créer mon lien privé", exact: true }).click();
    await expect(dialog.getByRole("link", { name: /Google Agenda/ })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?cid=webcal/);
    await expect(dialog.getByRole("link", { name: /Apple Calendrier/ })).toHaveAttribute("href", /^webcal:\/\//);
    await expect(dialog.getByRole("link", { name: /Outlook/ })).toHaveAttribute("href", /^https:\/\/outlook\.live\.com\//);
    await expect(dialog.getByRole("img", { name: "Code QR du lien d’abonnement" })).toBeVisible();
    await axe(page, "subscription", "dialog[open]");
    const first = await dialog.getByLabel("Lien privé à conserver", { exact: true }).inputValue();
    const ics = await (await anon.request.get(first)).text();
    expect(ics).toContain("SUMMARY:Entraînement Lions");
    expect(ics).not.toContain("SUMMARY:Réunion du bureau");
    await dialog.getByRole("button", { name: /^Régénérer/ }).click();
    await expect(dialog.getByLabel("Lien privé à conserver", { exact: true })).not.toHaveValue(first);
    expect((await anon.request.get(first)).status()).toBe(404);
    const second = await dialog.getByLabel("Lien privé à conserver", { exact: true }).inputValue();
    expect((await anon.request.get(second)).status()).toBe(200);
    await dialog.getByRole("button", { name: /^Révoquer/ }).first().click();
    await expect.poll(async () => (await anon.request.get(second)).status()).toBe(404);

    // 6. The player: "Bien démarrer" until a link exists, the list by default on a phone.
    expect((await playerPage.request.post("/api/workspace", { headers: { origin }, data: { action: "context", mandateId: mandates[1] } })).status()).toBe(200);
    await playerPage.setViewportSize({ width: 390, height: 844 });
    await playerPage.goto("/fr");
    const start = playerPage.getByRole("region", { name: "Bien démarrer" });
    await expect(start.getByText("Ajoutez les entraînements à votre agenda")).toBeVisible();
    await start.getByRole("link", { name: "Commencer" }).click();
    await expect(playerPage).toHaveURL(/\/fr\/calendar\?subscribe=1$/);
    const own = playerPage.getByRole("dialog", { name: "S’abonner au calendrier" });
    await own.getByRole("radio", { name: "Mes événements" }).check();
    await own.getByRole("button", { name: "Créer mon lien privé", exact: true }).click();
    const mine = await own.getByLabel("Lien privé à conserver", { exact: true }).inputValue();
    const mineIcs = await (await anon.request.get(mine)).text();
    expect(mineIcs).toContain("SUMMARY:Entraînement Lions");
    expect(mineIcs).not.toContain("SUMMARY:Réunion du bureau");
    await own.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(playerPage.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: "Liste", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(playerPage.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: "3 jours", exact: true })).toBeVisible();
    expect(await playerPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await playerPage.goto("/fr");
    await expect(playerPage.getByRole("region", { name: "Bien démarrer" })).toHaveCount(0);
  } finally {
    await playerContext.close();
    await anon.close();
    await db.end();
  }
});
