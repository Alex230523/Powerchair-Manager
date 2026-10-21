import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Tournaments (21/10/2026): a club president creates a tournament, plans a
 * match day and a match, enters and validates the result, sees the table,
 * the scorers and the calendar capsule, closes the tournament and finds the
 * podium in the trophy gallery. Axe and overflow checks at 1280 and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function fits(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label).toBe(true);
}

test("tournaments: create, plan, report, validate, standings, calendar, gallery", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `tournament-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Tournament president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Tournoi club','club') RETURNING id")).rows[0].id;
    const rival = (await db.query("INSERT INTO organization(name,kind) VALUES('Club rival e2e','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Zoé Buteuse','2009-01-01','{player}' FROM p",
      [club],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The menu leads to Tournaments; create one, inviting the rival club.
    await page.goto("/fr/tournaments");
    await expect(page.getByRole("heading", { name: "Tournois", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Galerie des trophées" })).toBeVisible();
    await axe(page, "list empty");
    await page.getByRole("button", { name: "Ajouter un tournoi" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom du tournoi").fill("Coupe e2e");
    await dialog.getByLabel("Type de tournoi").selectOption("league");
    await expect(dialog.getByLabel("Points pour une victoire")).toHaveValue("3");
    await dialog.getByLabel("Club rival e2e").check();
    await axe(page, "create dialog");
    await dialog.getByRole("button", { name: "Créer le tournoi" }).click();
    await expect(page).toHaveURL(/\/fr\/tournaments\/[0-9a-f-]{36}$/);
    const tournament = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: "Coupe e2e", level: 1 })).toBeVisible();
    // The rival accepts (its president would do it from his own page).
    expect((await db.query("SELECT status FROM tournament_club WHERE tournament_id=$1 AND organization_id=$2", [tournament, rival])).rows[0].status).toBe("invited");
    await db.query("UPDATE tournament_club SET status='accepted',responded_at=now() WHERE tournament_id=$1 AND organization_id=$2", [tournament, rival]);
    await page.reload();

    // 2. A match day today at our hall (Brussels date), and a match.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    await page.getByRole("button", { name: "Ajouter une journée" }).first().click();
    await page.getByRole("dialog").getByLabel("Date").fill(today);
    await page.getByRole("dialog").getByLabel("Lieu").fill("Salle e2e");
    await page.getByRole("dialog").getByLabel("Club organisateur").selectOption({ label: "Tournoi club" });
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    const day = page.locator("details.match-day").first();
    await day.locator("summary").click();
    await expect(day).toContainText("Salle e2e");
    await day.getByRole("button", { name: "Ajouter un match" }).click();
    await page.getByRole("dialog").getByLabel("Club à domicile").selectOption({ label: "Tournoi club" });
    await page.getByRole("dialog").getByLabel("Club visiteur").selectOption({ label: "Club rival e2e" });
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await expect(day.locator(".match-row")).toHaveCount(1);
    await axe(page, "detail planned");

    // 3. The organiser enters the result with a scorer and validates at once.
    await day.getByRole("button", { name: "Encoder le résultat" }).click();
    const result = page.getByRole("dialog");
    await result.getByLabel("Buts Tournoi club").fill("2");
    await result.getByLabel("Buts Club rival e2e").fill("1");
    await result.getByLabel("Buts Zoé Buteuse").fill("2");
    await axe(page, "result dialog");
    await result.getByRole("button", { name: "Enregistrer" }).click();
    await expect(day.locator(".match-row")).toHaveAttribute("data-status", "validated");
    const first = page.locator(".standings tbody tr").first();
    await expect(first).toContainText("Tournoi club");
    await expect(first.locator("td").last()).toHaveText("3");
    await expect(page.locator(".tournament-situation")).toContainText("Zoé Buteuse");
    await axe(page, "detail played");
    await page.setViewportSize({ width: 390, height: 844 });
    await fits(page, "detail 390");
    await axe(page, "detail 390");
    await page.setViewportSize({ width: 1280, height: 900 });

    // 4. The day is a capsule of the calendar, linking back to the tournament.
    await page.goto("/fr/calendar");
    await expect(page.locator('.board-deadline[data-source="tournament"]').first()).toContainText("Coupe e2e");

    // 5. Close: the podium joins the gallery.
    await page.goto(`/fr/tournaments/${tournament}`);
    await page.getByRole("button", { name: "Clôturer le tournoi" }).click();
    await expect(page.getByText("Clôturer ? Le podium devient définitif")).toBeVisible();
    await page.getByRole("button", { name: "Clôturer le tournoi" }).click();
    await expect(page.locator(".tournament-badges").first()).toContainText("Terminé");
    await page.goto("/fr/tournaments/trophies");
    await expect(page.locator(".trophy-card")).toHaveCount(2);
    await expect(page.locator('.trophy-card[data-rank="1"]')).toContainText("Tournoi club");
    await axe(page, "gallery");
    await page.setViewportSize({ width: 390, height: 844 });
    await fits(page, "gallery 390");
    await page.goto(`/fr/tournaments?year=${new Date().getFullYear()}`);
    await fits(page, "list 390");
    await axe(page, "list 390");

    // 6. The old federation calendar address leads here.
    await page.goto("/fr/federal-calendar");
    await expect(page).toHaveURL(/\/fr\/tournaments/);
  } finally {
    await db.end();
  }
});
