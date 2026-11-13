import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { createAccount, prepareSignIn } from "../support/session";

/**
 * Wave 17 (G1): the president hands over the presidency from Settings >
 * Members; nothing changes before acceptance, and the handover can be
 * cancelled (acceptance and dates: integration tests).
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("presidency handover from the club", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(300000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const email = `g1-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "G1 présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id", [`G2 Club ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const member = await createAccount(db, "Marie Membre", `g1-member-${stamp}@example.test`, "Browser-test-passphrase-2026!");
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, member.id]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach')", [club, member.id]);
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Settings > Fonctionnement (12, 13/11/2026): hand over to Marie; the outgoing president would keep « Coach ».
    await page.goto("/fr/settings/organisation");
    const card = page.locator(".card, section, article").filter({ has: page.getByRole("heading", { name: "Transmettre la présidence" }) }).last();
    await card.getByRole("combobox", { name: "Choisir une personne du club" }).selectOption({ label: `Marie Membre · g1-member-${stamp}@example.test` });
    await card.getByRole("radio", { name: "Coach" }).check();
    await card.getByLabel("Message (facultatif)").fill("À toi de jouer");
    await axe(page, "handover");
    await card.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(card.getByText("Transmission en attente")).toBeVisible();
    await expect(card).toContainText(`g1-member-${stamp}@example.test`);
    await expect(card).toContainText("Vous gardez : Coach");
    // Nothing changed: still one president, the same.
    const presidents = async () =>
      (await db.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())", [club])).rows.map((r) => r.user_id);
    expect(await presidents()).toEqual([user]);
    await card.getByRole("button", { name: "Annuler la transmission" }).click();
    await expect(card.getByRole("button", { name: "Envoyer l'invitation" })).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1 AND succession AND revoked_at IS NULL", [club])).rows[0].n).toBe(0);

  } finally {
    await db.end();
  }
});
