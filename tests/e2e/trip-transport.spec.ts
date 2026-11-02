import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 3 on a phone (390 px): the trip's window from the list, a rental added
 * with its driver (licence checked first), its round proposed with the
 * agency, the tasks sent to the to-do, the road sheet. Axe on each state,
 * no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("a rental's round, its tasks and the road sheet on a phone", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `trip-transport-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Transport", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club du transport','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const person = async (name: string, roles: string) => {
      const p = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,$3,$4) RETURNING id", [club, p, name, roles])).rows[0].id as string;
    };
    const driver = await person("Diane Chauffeur", "{coach}");
    await person("Zoé Sans Permis", "{coach}");
    const player = await person("Paul Fauteuil", "{player}");
    await db.query("INSERT INTO driver_licence(profile_id,organization_id,categories,updated_by,verified_on) VALUES($1,$2,'{B}',$3,CURRENT_DATE)", [driver, club, user]);
    const trip = (
      await db.query(
        "INSERT INTO trip(organization_id,title,kind,mode,starts_on,ends_on,destination,meeting_point,departure_at,return_at,created_by) VALUES($1,'Match à Gand','away_match','transport',CURRENT_DATE+12,CURRENT_DATE+12,'Sporthal, Gent','Local, Namur',(CURRENT_DATE+12)+time '08:00',(CURRENT_DATE+12)+time '18:00',$2) RETURNING id",
        [club, user],
      )
    ).rows[0].id as string;
    await db.query("INSERT INTO trip_participant(trip_id,profile_id,role,status,chair) VALUES($1,$2,'player','confirmed','powerchair')", [trip, player]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // The list: the trip's window opens on a click.
    await page.goto("/fr/trips");
    await page.getByRole("button", { name: "Voir le détail : Match à Gand" }).click();
    const window = page.getByRole("dialog", { name: "Match à Gand" });
    await expect(window.getByText(/Transport/).first()).toBeVisible();
    await axe(page, "trip window");
    await window.getByRole("link", { name: "Ouvrir la fiche complète" }).click();

    // A rental with its driver: the one with the right licence comes first.
    await expect(page.getByRole("heading", { name: "Match à Gand", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Ajouter un véhicule" }).click();
    await page.getByRole("radio", { name: "Location" }).check();
    await page.getByLabel(/^Nom/).fill("Camionnette louée");
    await page.getByLabel("Places assises").fill("8");
    await page.getByLabel("Places fauteuil").fill("2");
    await page.getByLabel("Rampe ou lift").check();
    await page.getByLabel("Adresse de retrait").fill("Agence Ucar, Namur");
    const candidates = page.locator(".trip-driver-candidates li");
    await expect(candidates.first()).toContainText("Diane Chauffeur");
    await expect(candidates.first()).toContainText("Permis vérifié");
    await expect(candidates.filter({ hasText: "Zoé Sans Permis" })).toContainText("Sans le permis B");
    await page.getByRole("button", { name: "Ajouter ce chauffeur : Diane Chauffeur" }).click();
    await page.getByRole("checkbox", { name: /Paul Fauteuil/ }).check();
    await axe(page, "vehicle form");
    await noScroll(page);
    // The vehicle form, not another card of the page.
    await page.locator("form").filter({ has: page.getByLabel("Adresse de retrait") }).getByRole("button", { name: "Enregistrer", exact: true }).click();
    const card = page.locator(".vehicle-card").filter({ hasText: "Camionnette louée" });
    await expect(card.getByText("Retrait du véhicule").first()).toBeVisible();
    await expect(card.getByText("Retour du véhicule").first()).toBeVisible();
    await expect(card.getByText("Le chargement tient dans le véhicule.").first()).toBeVisible();
    await axe(page, "vehicle round");
    await noScroll(page);

    // The tasks drawn from the round go to the to-do once.
    await page.getByRole("checkbox", { name: "Créer les tâches" }).check();
    await expect(page.getByRole("group", { name: /Réserver le véhicule/ })).toBeVisible();
    await axe(page, "tasks");
    await page.getByRole("button", { name: "Envoyer dans la to-do" }).click();
    await expect.poll(async () => Number((await db.query("SELECT count(*)::int AS n FROM task WHERE trip_id=$1", [trip])).rows[0].n)).toBeGreaterThan(3);

    // The road sheet.
    await page.goto(`/fr/trips/${trip}/roadsheet`);
    await expect(page.getByRole("heading", { name: "Feuille de route : Match à Gand", level: 1 })).toBeVisible();
    await expect(page.getByText("Agence Ucar, Namur").first()).toBeVisible();
    await axe(page, "road sheet");
    await noScroll(page);
    await page.screenshot({ path: "test-results/trip-transport-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
