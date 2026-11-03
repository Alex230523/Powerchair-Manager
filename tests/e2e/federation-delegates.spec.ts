import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 32 and 33 on a phone (390 px): the federation's presidency appoints a
 * referee « Responsable arbitrage » on « Équipe fédérale », then writes and
 * sends a circular with a read receipt; the follow-up shows the club. Axe on
 * each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("delegates and circulars of a federation", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `fed-team-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidence Fédé", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération équipe','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club circulaire','club',$1) RETURNING id", [fed])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [fed, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id;
    // A referee of the federation, and a club's president.
    for (const [org, role, name] of [
      [fed, "referee", "Rita Arbitre"],
      [club, "club_president", "Paul Président"],
    ]) {
      const id = (await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES(gen_random_uuid()::text,$1,$2,true) RETURNING id`, [name, `${role}-${Date.now()}@example.test`])).rows[0].id;
      await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, id]);
      await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3)", [org, id, role]);
    }
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/federation/team");
    await expect(page.getByRole("heading", { name: "Équipe fédérale", level: 1 })).toBeVisible();
    const appoint = page.locator("section").filter({ has: page.getByRole("heading", { name: "Désigner une personne" }) });
    await appoint.getByLabel("Personne").selectOption({ label: "Rita Arbitre · Fédération équipe" });
    await appoint.getByLabel("Responsable arbitrage").check();
    await appoint.getByRole("button", { name: "Désigner une personne" }).click();
    await expect(page.locator(".staff-people").getByText("Rôles de Rita Arbitre")).toBeVisible();
    await axe(page, "federation team");
    await noSideScroll(page);

    await page.goto("/fr/circulars");
    await page.getByRole("button", { name: "Nouvelle circulaire" }).click();
    await page.getByLabel("Titre").fill("Nouveau règlement des compétitions");
    await page.getByLabel("Texte", { exact: true }).fill("Le règlement change au 1er janvier. Merci de le lire.");
    await page.getByLabel("Accusé de lecture obligatoire").check();
    await axe(page, "compose");
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    const sent = page.locator(".circular-list li").filter({ hasText: "Nouveau règlement des compétitions" });
    await sent.getByRole("button", { name: /^Envoyer/ }).click();
    await expect(sent.getByText("Envoyée")).toBeVisible();
    await sent.getByRole("link", { name: "Nouveau règlement des compétitions" }).click();
    await expect(page.getByRole("heading", { name: "Suivi par club" })).toBeVisible();
    await expect(page.getByText(/Club circulaire/).first()).toBeVisible();
    await axe(page, "follow-up");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/federation-delegates-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
