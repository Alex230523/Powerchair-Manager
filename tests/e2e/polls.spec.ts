import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { prepareSignIn } from "../support/session";

/**
 * H3 on a phone (390 px): the president asks a team two dates; the player
 * answers from his personal link without signing in, once; the president
 * closes and turns the date into the event. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
const local = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
};

test("a date poll, answered by the personal link, becomes the event", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `polls-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Paula Sondage", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Sondages','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison sondage',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Faucons') RETURNING id", [club, season])).rows[0].id as string;
    // A player with an account.
    const pu = randomUUID();
    await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Léo Joueur\',$2,true)', [pu, `${pu}@example.test`]);
    const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [pu])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, pu]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'player')", [club, pu]);
    const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Léo Joueur','{player}') RETURNING id", [club, person])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [club, team, profile]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // From the team's sheet: « Nouveau sondage », the team chosen.
    await page.goto(`/fr/sondages?new=1&team=${team}`);
    await expect(page.getByRole("heading", { name: "Nouveau sondage", level: 2 })).toBeVisible();
    await page.getByLabel("Question").fill("Quand jouer contre les Aigles ?");
    await expect(page.getByLabel("Qui répond")).toHaveValue("team");
    await page.getByLabel("Date de clôture").fill(local(3, 20));
    await page.getByLabel(/^Option 1 \*?$/).fill("Samedi");
    await page.getByLabel("Date et heure de l'option 1").fill(local(10, 14));
    await page.getByLabel(/^Option 2 \*?$/).fill("Dimanche");
    await page.getByLabel("Date et heure de l'option 2").fill(local(11, 10));
    await axe(page, "poll form");
    await noSideScroll(page);
    await page.getByRole("button", { name: "Envoyer le sondage" }).click();
    await expect(page.getByText("Sondage envoyé : 1 destinataires.")).toBeVisible();

    // The player's personal link, without signing in, once.
    const href = (await db.query("SELECT href FROM app_notification WHERE recipient_user_id=$1 AND href LIKE '%/sondage/%'", [pu])).rows[0].href as string;
    const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await guest.goto(href);
    await expect(guest.getByRole("heading", { name: "Quand jouer contre les Aigles ?", level: 1 })).toBeVisible();
    const samedi = guest.getByRole("group", { name: /Samedi/ });
    await samedi.getByLabel("Oui").check();
    await guest.getByRole("group", { name: /Dimanche/ }).getByLabel("Non").check();
    await axe(guest, "personal link");
    await noSideScroll(guest);
    await guest.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guest.getByText("Merci, votre réponse est enregistrée.").first()).toBeVisible();
    await guest.reload();
    await expect(guest.getByText(/Ce lien a déjà servi/)).toBeVisible();
    await guest.close();

    // Live results, then the date becomes the event.
    await page.goto("/fr/sondages");
    await expect(page.getByText("1 réponses sur 1")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Léo Joueur" })).toBeVisible();
    await axe(page, "poll results");
    await noSideScroll(page);
    await page.getByRole("button", { name: "Clore maintenant" }).click();
    await expect(page.getByLabel("Option retenue")).toBeVisible();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page.getByText("Événement créé : 1 personnes invitées.")).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1 AND kind='meeting'", [club])).rows[0].n).toBe(1);
    await page.screenshot({ path: "test-results/polls-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
