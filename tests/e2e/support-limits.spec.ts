import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Security (07/11/2026), badly defined permissions: a platform operator opens
 * a club with a support access (a presidency for half an hour). On a phone
 * (390 px) he can correct the club's name, but changing its IBAN is refused
 * with a sentence that says why; the IBAN stays as it was. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("a support access corrects the club, never moves its money", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `support-${stamp}@example.test`,
    iban = "BE68539007547034";
  try {
    await prepareSignIn(page, db, "Sam Support", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'support')", [user]);
    const club = (await db.query("INSERT INTO organization(name,kind,city,iban) VALUES($1,'club','Namur',$2) RETURNING id", [`Club soutenu ${stamp}`, iban])).rows[0].id;
    // The console's « Ouvrir comme président (support) », as it writes it.
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,valid_until,created_by) VALUES($1,$2,'club_president',now()+interval '30 minutes',$2) RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO platform_borrow(operator_id,organization_id,mandate_id,reason,expires_at) VALUES($1,$2,$3,'Vérifier la fiche du club',now()+interval '30 minutes')", [user, club, mandate]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/settings/club");
    const form = page.locator("form").filter({ has: page.locator("#club-iban") });
    await expect(form.locator("#club-iban")).toHaveValue(iban);
    // The IBAN: refused, with the reason.
    await form.locator("#club-iban").fill("BE71 0961 2345 6769");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Un accès de support ne change ni les mandats, ni les droits, ni la présidence, ni les clés, ni le compte bancaire.", { exact: false })).toBeVisible();
    expect((await db.query("SELECT iban FROM organization WHERE id=$1", [club])).rows[0].iban).toBe(iban);
    await axe(page, "support access refused");
    // The name, IBAN untouched: corrected.
    await page.reload();
    await form.locator("#club-name").fill(`Club soutenu ${stamp} (corrigé)`);
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect.poll(async () => (await db.query("SELECT name FROM organization WHERE id=$1", [club])).rows[0].name).toBe(`Club soutenu ${stamp} (corrigé)`);
    expect((await db.query("SELECT iban FROM organization WHERE id=$1", [club])).rows[0].iban).toBe(iban);
  } finally {
    await db.end();
  }
});
