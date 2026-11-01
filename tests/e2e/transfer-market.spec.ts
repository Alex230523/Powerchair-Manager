import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (J3): the transfer market. The adult player ticks her own
 * visibility; club B finds her, opens her sporting sheet and asks for a
 * transfer; the clubs talk in their conversation (also in Messages); the
 * player agrees, club A accepts, the federation validates. Axe and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("transfer market: consent, sheet, request, conversation, agreement, validation", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `j3-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "J3 Joueuse", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('J3 fédération','federation') RETURNING id")).rows[0].id;
    const clubA = (await db.query("INSERT INTO organization(name,kind,federation_id,province) VALUES('J3 club A','club',$1,'namur') RETURNING id", [federation])).rows[0].id;
    const clubB = (await db.query("INSERT INTO organization(name,kind,federation_id,province) VALUES('J3 club B','club',$1,'liege') RETURNING id", [federation])).rows[0].id;
    const mandate: Record<string, string> = {};
    for (const [key, org, role] of [
      ["F", federation, "federation_president"],
      ["A", clubA, "club_president"],
      ["B", clubB, "club_president"],
    ] as const) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [org, user]);
      mandate[key] = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
    }
    // The account is also an adult player of club A: her own choice.
    const person = (await db.query("SELECT id FROM person WHERE user_id=$1", [user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,email) VALUES($1,$2,'J3 Joueuse','1995-03-03','{player}',$3)", [clubA, person, email]);
    await page.goto("/fr");
    await switchTo(page, mandate.A);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The player ticks her visibility herself.
    await page.goto("/fr/transfers");
    const visible = page.getByLabel("Visible par les autres clubs de la fédération : J3 Joueuse");
    await expect(visible).not.toBeChecked();
    await visible.click();
    await expect(visible).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    await axe(page, "market club A");

    // 2. Club B finds her, opens her sheet and asks for a transfer.
    await switchTo(page, mandate.B);
    await page.goto("/fr/transfers");
    await page.getByLabel("Province").selectOption({ label: "Namur" });
    const row = page.getByRole("row").filter({ hasText: "J3 Joueuse" });
    await expect(row).toContainText("J3 club A");
    await expect(row).toContainText("Non définie");
    await expect(page.locator("main")).not.toContainText(email);
    await expect(page.locator("main")).not.toContainText("1995");
    await row.getByRole("button", { name: "Fiche sportive de J3 Joueuse" }).click();
    const sheet = page.getByRole("dialog", { name: "J3 Joueuse" });
    await expect(sheet).toContainText("Historique des clubs");
    await axe(page, "sporting sheet");
    await sheet.getByRole("button", { name: "Demander un transfert" }).click();
    const form = sheet.getByRole("form", { name: "Demander le transfert de J3 Joueuse" });
    await form.getByLabel("Message").fill("Nous aimerions t'accueillir.");
    await form.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demande envoyée" })).toBeVisible();

    // 3. The conversation between the two clubs.
    await page.getByRole("tab", { name: /^Demandes de transfert/ }).click();
    const offer = page.getByRole("row").filter({ hasText: "J3 club A → J3 club B" });
    await expect(offer).toContainText("Envoyée");
    await offer.getByRole("button", { name: /^Conversation \(0\)/ }).click();
    await page.getByLabel("Votre message").fill("Quand pouvons-nous en parler ?");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(page.locator(".transfer-messages")).toContainText("Quand pouvons-nous en parler ?");
    await axe(page, "conversation");
    await switchTo(page, mandate.A);
    await page.goto("/fr/messages");
    const threads = page.getByRole("region", { name: "Conversations entre clubs" });
    await threads.getByRole("button", { name: /Conversation entre J3 club A et J3 club B/ }).click();
    await expect(threads).toContainText("Quand pouvons-nous en parler ?");

    // 4. The player agrees, club A accepts.
    await page.goto("/fr/transfers");
    await page.getByRole("button", { name: "Donner mon accord : J3 club B" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    await page.getByRole("tab", { name: /^Demandes de transfert/ }).click();
    await page.getByRole("row").filter({ hasText: "J3 club A → J3 club B" }).getByRole("button", { name: "Accepter : J3 Joueuse · J3 club B" }).click();
    await expect(page.getByRole("row").filter({ hasText: "J3 club A → J3 club B" })).toContainText("Acceptée");

    // 5. The federation validates; the player moves.
    await switchTo(page, mandate.F);
    await page.goto("/fr/federation/licenses");
    await page.getByRole("link", { name: /Transferts de la bourse à valider : 1/ }).click();
    await page.getByRole("tab", { name: /^Demandes de transfert/ }).click();
    await page.getByRole("button", { name: "Valider le transfert : J3 Joueuse · J3 club B" }).click();
    await expect(page.getByRole("row").filter({ hasText: "J3 club A → J3 club B" })).toContainText("Validée par la fédération");
    expect((await db.query("SELECT status FROM club_person WHERE person_id=$1 AND organization_id=$2", [person, clubB])).rows[0].status).toBe("active");
    await axe(page, "federation market");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/transfers");
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "market 390");
  } finally {
    await db.end();
  }
});
