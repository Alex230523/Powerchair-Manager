import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";
import { sampleCamt } from "../../src/domains/bank/samples";
import { formatReference } from "../../src/domains/bank/reference";

/**
 * B1: Finances › Relevés de compte. The dues account, a camt.053 statement
 * previewed then imported (the transfer with its structured communication
 * files itself), the same file again creates nothing, the other transfer
 * reconciled from its suggestion; the player's sheet shows the transfer
 * QR and says it does not confirm the payment. Axe and 390 px.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("bank statement import, reconciliation and the transfer QR", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B1 Trésorière", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B1 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const ana = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana Peeters','2011-05-05','{player}') RETURNING id", [club, person])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    const post = async (data: Record<string, unknown>) => {
      const r = await page.request.post("/api/dues", { headers: { origin }, data: { organizationId: club, ...data } });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    const plan = (await post({ action: "plan", seasonId: season, category: "Joueur", amountCents: 25000, maxInstallments: 4, firstDue: "2026-11-01" })).id;
    const fee = (await post({ action: "issue", planId: plan, profileId: ana, installments: 4, firstDue: "2026-11-01" })).id;
    const first = (await db.query("SELECT reference FROM dues_installment WHERE receivable_id=$1 ORDER BY ordinal LIMIT 1", [fee])).rows[0].reference;
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. The dues account.
    await page.goto("/fr/funding/statements");
    await page.getByRole("button", { name: "Ajouter un compte" }).click();
    const account = page.getByRole("dialog", { name: "Ajouter un compte" });
    await account.getByLabel("Nom du compte").fill("Compte courant");
    await account.getByLabel("IBAN", { exact: true }).fill("BE68 5390 0754 7035");
    await account.getByRole("button", { name: "Enregistrer" }).click();
    await expect(account.getByRole("alert")).toContainText("IBAN n'est pas valide");
    await account.getByLabel("IBAN", { exact: true }).fill("BE68 5390 0754 7034");
    await expect(account.getByLabel("Compte des cotisations")).toBeChecked();
    await account.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator(".bank-accounts")).toContainText("BE68 5390 0754 7034");
    await axe(page, "accounts");

    // 2. A camt.053 statement: the preview, then the import.
    const today = (await db.query("SELECT CURRENT_DATE::text AS d")).rows[0].d as string;
    const file = sampleCamt("BE68539007547034", [
      { bookedOn: today, amountCents: 6250, counterparty: "PEETERS MARIE", counterpartyIban: "BE71096123456769", communication: formatReference(first), bankRef: "E2E-1" },
      { bookedOn: today, amountCents: 10000, counterparty: "M. PEETERS", counterpartyIban: "BE71096123456769", communication: "cotisation Ana", bankRef: "E2E-2" },
    ]);
    const importOnce = async () => {
      await page.getByRole("button", { name: "Importer un relevé" }).click();
      const dialog = page.getByRole("dialog", { name: "Importer un relevé" });
      await dialog.getByLabel("Fichier du relevé").setInputFiles({ name: "octobre.xml", mimeType: "application/xml", buffer: Buffer.from(file) });
      await expect(dialog.getByRole("status")).toContainText("Format camt.053");
      await dialog.getByRole("button", { name: "Voir l'aperçu" }).click();
      return dialog;
    };
    let dialog = await importOnce();
    await expect(dialog.getByText("2 nouvelle(s) ligne(s), 0 déjà importée(s), 1 se rangeront toutes seules.")).toBeVisible();
    await axe(page, "import preview", "dialog[open]");
    await dialog.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "2 ligne(s) importée(s), 1 rapprochée(s) toute(s) seule(s)" })).toBeAttached();

    // 3. The same file again: nothing new.
    dialog = await importOnce();
    await expect(dialog.getByText("Rien de nouveau")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Importer", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect((await db.query("SELECT count(*)::int AS n FROM bank_line WHERE organization_id=$1", [club])).rows[0].n).toBe(2);

    // 4. The transfer without reference, from its suggestion.
    const open = page.locator("#bank-open .bank-line").filter({ hasText: "M. PEETERS" });
    await open.getByRole("button", { name: /^Affecter à Ana Peeters/ }).click();
    const split = page.getByRole("dialog", { name: /^Affecter le mouvement/ });
    await expect(split.getByRole("combobox", { name: "Cotisation", exact: true })).toHaveValue(fee);
    await expect(split.getByLabel("Montant", { exact: true })).toHaveValue("100.00");
    await axe(page, "allocate", "dialog[open]");
    await split.getByRole("button", { name: "Affecter", exact: true }).click();
    await expect(page.locator("#bank-open")).toContainText("Tout est rapproché.");
    expect((await db.query("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM finance_transaction WHERE receivable_id=$1 AND cancelled_at IS NULL", [fee])).rows[0].n).toBe(16250);
    await axe(page, "reconciled");

    // 5. The player's sheet: the QR of the next instalment, which proves nothing.
    await page.goto(`/fr/players/${ana}`);
    await page.getByText("Payer par virement").click();
    const qr = page.locator(".bank-qr");
    await expect(qr.getByRole("img", { name: /^QR de virement de/ })).toBeVisible();
    await expect(qr).toContainText("ne confirme pas le paiement");
    await expect(qr).toContainText("+++");
    await axe(page, "player QR");
  } finally {
    await db.end();
  }
});
