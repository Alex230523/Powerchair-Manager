import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 9 on a phone (390 px): a reserved fund created and its cash in three
 * figures; the attestation previewed as a PDF; the signature card in
 * Réglages › Club; the menu's Finances group with four entries and no third
 * row of tabs. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("reserved funds, the attestation PDF and the signature", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `money9-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Tess Trésorière", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,address,company_number) VALUES('Club des Fonds','club','Rue 1, 4000 Liège','0123.456.789') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison fonds',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO grant_application(organization_id,funder,status,granted_cents,created_by) VALUES($1,'Province','granted',300000,$2)", [club, user]);
    await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Subside reçu','in','subsidy',200000,$2)", [club, user]);
    // A player paid in full.
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Adulte','1990-01-01','{player}') RETURNING id", [club, person])).rows[0].id;
    const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',20000,1,CURRENT_DATE) RETURNING id", [club, season])).rows[0].id;
    const fee = (await db.query("INSERT INTO dues_receivable(organization_id,plan_id,season_id,profile_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',20000,0,$5) RETURNING id", [club, plan, season, profile, user])).rows[0].id;
    await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by,receivable_id) VALUES($1,CURRENT_DATE,'Cotisation','in','dues',20000,$2,$3)", [club, user, fee]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // Reserved funds: one allocation of the grant.
    await page.goto("/fr/funding/reserved");
    await expect(page.getByRole("heading", { name: "Fonds réservés", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Nouvelle affectation" }).click();
    await page.getByLabel(/^Subside/).selectOption({ label: "Province" });
    await page.getByLabel("Libellé").fill("2 fauteuils Strike Force");
    await page.getByLabel("Montant prévu").fill("3000");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: "2 fauteuils Strike Force" })).toBeVisible();
    await page.getByLabel("Rattacher une opération").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Rattacher" }).click();
    await expect(page.getByText(/Subside reçu/).first()).toBeVisible();
    await axe(page, "reserved funds");
    await noSideScroll(page);
    // The cash in three figures, its legend in words.
    await page.goto("/fr/funding");
    await expect(page.getByText(/réservés et .* disponibles sur/)).toBeVisible();
    await axe(page, "finances overview");
    await noSideScroll(page);

    // The attestation: preview of the PDF, download, print, send.
    await page.goto(`/fr/dues/attestations?season=${season}`);
    await page.getByRole("button", { name: "Aperçu : Léa Adulte" }).click();
    const dialog = page.getByRole("dialog", { name: "Attestation de Léa Adulte" });
    await expect(dialog.getByTitle("Attestation au format PDF")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Télécharger" })).toBeVisible();
    await axe(page, "attestation preview");
    await dialog.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    const pdf = await page.request.get(`/api/dues/attestations/pdf?profile=${profile}&season=${season}&locale=fr`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    await noSideScroll(page);

    // Réglages › Finances (13/11/2026): the signature card.
    await page.goto("/fr/settings/money");
    await expect(page.getByRole("heading", { name: "Signature des attestations" })).toBeVisible();
    await axe(page, "signature settings");
    await noSideScroll(page);

    // The Finances group: four entries; Grants & sponsors has no row of finance tabs.
    await page.goto("/fr/funding/grants-sponsors");
    await expect(page.getByRole("navigation", { name: "Sections des finances" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/money9-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
