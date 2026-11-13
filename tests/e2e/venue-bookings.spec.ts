import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";
import { brusselsDay } from "../../src/lib/today";

/**
 * 18 on a phone (390 px): the hall's booking worked out from a weekly
 * series, the email ready for the hall, the booking requested then
 * confirmed, an invoice added and its expense recorded once. Axe on each
 * state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("a hall's booking from the calendar, on a phone", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `venue-bookings-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Salles", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des salles','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const person = (await db.query("SELECT id FROM person WHERE user_id=$1", [user])).rows[0]?.id ?? (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Présidente Salles')", [club, person]);
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027',CURRENT_DATE-30,CURRENT_DATE+300)", [club]);
    const contact = (await db.query("INSERT INTO contact(organization_id,full_name,email,created_by) VALUES($1,'Marc Gestionnaire','salle@example.test',$2) RETURNING id", [club, user])).rows[0].id;
    const hall = (await db.query("INSERT INTO calendar_place(organization_id,name,address,category,contact_id,booking_needed) VALUES($1,'Hall des Sports','Rue du Hall 1, Namur','training',$2,true) RETURNING id", [club, contact])).rows[0].id;
    await db.query("INSERT INTO venue_rate(organization_id,place_id,label,amount_cents,valid_from,created_by) VALUES($1,$2,'Heure de salle',5000,CURRENT_DATE-60,$3)", [club, hall, user]);
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,7,6,$2) RETURNING id", [club, user])).rows[0].id;
    for (let i = 0; i < 6; i++)
      await db.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,place_id,responsible_user_id,visibility)
         VALUES($1,$2,$3,'Entraînement','training','Europe/Brussels',((CURRENT_DATE+$4::int)+time '18:00') AT TIME ZONE 'Europe/Brussels',((CURRENT_DATE+$4::int)+time '20:00') AT TIME ZONE 'Europe/Brussels',
                to_char(CURRENT_DATE+$4::int,'YYYY-MM-DD')||'T18:00',to_char(CURRENT_DATE+$4::int,'YYYY-MM-DD')||'T20:00',$5,$6,'organization')`,
        [club, series, i + 1, 10 + i * 7, hall, user],
      );
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/venues");
    const card = page.locator(".booking-card").filter({ hasText: "Hall des Sports" });
    await expect(card.getByRole("heading", { name: "Hall des Sports · Saison 2026-2027" })).toBeVisible({ timeout: 15000 });
    await expect(card.locator(".trip-meta").getByText("À demander")).toBeVisible();
    await expect(card.getByRole("listitem").filter({ hasText: /\(6 séances\)/ })).toBeVisible();
    await card.locator("summary").filter({ hasText: "Email prêt à envoyer" }).click();
    await expect(card.getByRole("link", { name: "Ouvrir dans la messagerie" })).toHaveAttribute("href", /^mailto:salle@example\.test\?subject=/);
    await axe(page, "bookings");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    // The request task is in the to-do.
    expect(Number((await db.query("SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND source_kind='venueRequest'", [club])).rows[0].n)).toBe(1);

    await card.getByLabel("Statut").first().selectOption("confirmed");
    await card.getByLabel("Référence").first().fill("RES-118");
    await card.getByRole("button", { name: "Enregistrer le statut" }).click();
    await expect(card.locator(".trip-meta").getByText("Confirmée")).toBeVisible();

    await card.getByLabel("Montant (€)").fill("150");
    await card.getByLabel("Date de la facture").fill(brusselsDay());
    await card.getByRole("button", { name: "Ajouter la facture" }).click();
    await expect(card.locator(".booking-invoices li")).toHaveCount(1);
    await card.getByRole("button", { name: /^Enregistrer la dépense :/ }).click();
    await card.locator(".booking-invoices").getByRole("button", { name: "Enregistrer la dépense", exact: true }).click();
    await expect(card.getByText("Dépense enregistrée")).toBeVisible();
    expect(Number((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1 AND category='venue'", [club])).rows[0].n)).toBe(1);
    await axe(page, "booking invoice");
    await page.screenshot({ path: "test-results/venue-bookings-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
