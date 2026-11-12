import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { prepareSignIn } from "../support/session";

/**
 * 12/11/2026, a club without a federation, on the real server and on a phone
 * (390 px). A future president finds « Je crée mon club » on « Rejoindre la
 * plateforme », fills in the request with a discount code, confirms by the
 * link of the e-mail; the platform's owner makes the code in the console,
 * reads the request (its code valid) and accepts it: the club is created
 * without a federation, 30 days of trial, its president invited by the
 * platform. Axe at each step.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function mailUrl(address: string, subject: string) {
  let found = "";
  await expect
    .poll(async () => {
      for (const file of (await readdir(".local/mail-e2e").catch(() => [] as string[])).sort().reverse()) {
        const item = JSON.parse(await readFile(".local/mail-e2e/" + file, "utf8"));
        if (item.email === address && String(item.subject).includes(subject)) {
          found = item.url;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found;
}

test("a club asks to open without a federation, the owner makes a code and accepts it", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    president = `club-libre-${stamp}@example.test`,
    club = `Les Roues Libres ${stamp}`,
    code = `LANCE-${String(stamp).slice(-6)}`;
  try {
    // The future president, without an account.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/join");
    await expect(page.getByRole("heading", { name: "Je crée mon club, sans fédération" })).toBeVisible();
    await page.getByRole("link", { name: "Demander l’ouverture de mon club" }).click();
    await expect(page.getByRole("heading", { name: "Ouvrir mon club sans fédération" })).toBeVisible();
    await expect(page.getByText(/30 jours d’essai gratuit, puis 99 € par an/)).toBeVisible();
    await axe(page, "request form");
    await page.getByLabel("Nom du club").fill(club);
    await page.getByLabel("Pays").selectOption("FR");
    await page.getByLabel("Ville").fill("Lille");
    await page.getByLabel("Votre nom").fill("Inès Martin");
    await page.getByLabel("Votre adresse e-mail").fill(president);
    await page.getByLabel("Code de réduction (facultatif)").fill(code.toLowerCase());
    await page.getByLabel("Un mot pour l’équipe (facultatif)").fill("Douze joueurs, depuis 2019.");
    await page.getByRole("checkbox", { name: /J’accepte les/ }).check();
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByText(/un e-mail de confirmation vient de partir/)).toBeVisible();
    await axe(page, "request sent");
    // Nothing reaches the team before the confirmation.
    expect((await db.query("SELECT state,discount_code FROM club_request WHERE president_email=$1", [president])).rows).toEqual([{ state: "unconfirmed", discount_code: code }]);
    await page.goto(await mailUrl(president, "Confirmez la demande"));
    await expect(page.getByText(/Adresse confirmée : votre demande est chez l’équipe de la plateforme/)).toBeVisible();
    await axe(page, "request confirmed");
    expect((await db.query("SELECT state FROM club_request WHERE president_email=$1", [president])).rows[0].state).toBe("pending");

    // The platform's owner, in the console.
    // A context of its own (axe needs one), signed in apart from the public visitor.
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const email = `owner-club-${stamp}@example.test`;
    await prepareSignIn(owner, db, "Alex Plateforme", email, "Browser-test-passphrase-2026!");
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [user]);
    await owner.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(owner.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.goto("/fr/console");
    await owner.getByRole("tab", { name: "Facturation" }).click();
    await owner.getByRole("button", { name: "Nouveau code" }).click();
    const dialog = owner.getByRole("dialog");
    // The label carries the « required » star (hidden from the accessible name).
    await dialog.getByRole("textbox", { name: "Code", exact: true }).fill(code);
    await dialog.getByLabel("Valeur (%)").fill("50");
    await dialog.getByLabel("Factures concernées").selectOption("1");
    await axe(owner, "discount form");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(owner.getByText(code, { exact: true })).toBeVisible();
    await axe(owner, "discount codes");

    await owner.getByRole("tab", { name: "Organisations" }).click();
    const card = owner.locator(".club-requests");
    await expect(card.getByText(club)).toBeVisible();
    await expect(card.getByText(`Code de réduction : ${code}`)).toBeVisible();
    await expect(card.getByText("valable", { exact: true })).toBeVisible();
    await axe(owner, "club requests");
    await card.getByRole("button", { name: `Accepter et inviter : ${club}` }).click();
    await expect(owner.getByRole("dialog").getByText(president)).toBeVisible();
    await owner.getByRole("dialog").getByRole("button", { name: "Accepter et inviter" }).click();
    await expect(card.getByText("Acceptée", { exact: true }).first()).toBeVisible();

    const org = (await db.query("SELECT id,federation_id,country_code FROM organization WHERE name=$1", [club])).rows[0];
    expect(org).toMatchObject({ federation_id: null, country_code: "FR" });
    const sub = (await db.query("SELECT (trial_ends_on-started_on) AS days,auto_invoice,discount_cycles_left FROM billing_subscription WHERE organization_id=$1", [org.id])).rows[0];
    expect(sub).toEqual({ days: 30, auto_invoice: true, discount_cycles_left: 1 });
    expect((await db.query("SELECT role,issued_by_platform FROM invitation WHERE organization_id=$1", [org.id])).rows).toEqual([{ role: "club_president", issued_by_platform: true }]);
    await ownerContext.close();
  } finally {
    await db.end();
  }
});
