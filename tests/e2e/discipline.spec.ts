import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 34 on a phone (390 px): the federation confirms a red card's proposed
 * sanction; the club sees it, appeals and pays its fine. Axe on each state,
 * no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
const context = (page: Page, id: string) =>
  page.evaluate(async (mandateId) => {
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
  }, id);

test("discipline: confirm, appeal, pay", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `discipline-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Dora Discipline", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération discipline','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club des Faucons','club',$1) RETURNING id", [fed])).rows[0].id as string;
    for (const org of [fed, club]) await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
    const fedMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id as string;
    const clubMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const player = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Hugo Fougueux','{player}' FROM p RETURNING id", [club])).rows[0].id;
    const season = (await db.query("SELECT CASE WHEN to_char(CURRENT_DATE,'MM-DD')>='07-01' THEN to_char(CURRENT_DATE,'YYYY') ELSE (extract(year FROM CURRENT_DATE)::int-1)::text END AS y")).rows[0].y as string;
    const label = `${season}-${String(Number(season) + 1).slice(2)}`;
    await db.query(
      "INSERT INTO discipline_sanction(federation_id,organization_id,profile_id,target,cause,season,matches,kinds,fine_cents,summary) VALUES($1,$2,$3,'player','red',$4,2,'{league,cup}',2500,'Faute grossière')",
      [fed, club, player, label],
    );
    await page.goto("/fr");
    await context(page, fedMandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/federation/discipline");
    await expect(page.getByRole("heading", { name: "Discipline", level: 1 })).toBeVisible();
    const proposed = page.locator("section").filter({ has: page.getByRole("heading", { name: "À décider" }) });
    await expect(proposed.getByText("Hugo Fougueux", { exact: true })).toBeVisible();
    await axe(page, "federation desk");
    await proposed.getByRole("button", { name: /^Confirmer/ }).click();
    const running = page.locator("section").filter({ has: page.getByRole("heading", { name: "Suspensions en cours" }) });
    await expect(running.getByText("Hugo Fougueux", { exact: true })).toBeVisible();
    await noSideScroll(page);

    await context(page, clubMandate);
    await page.goto("/fr/discipline");
    const sanctions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Sanctions" }) });
    await expect(sanctions.getByText("Hugo Fougueux", { exact: true })).toBeVisible();
    await sanctions.getByText("Introduire un recours").click();
    await sanctions.getByLabel("Motif du recours").fill("Le joueur n'était pas sur le terrain à ce moment.");
    await axe(page, "appeal");
    await sanctions.getByRole("button", { name: "Envoyer le recours" }).click();
    await expect(sanctions.getByText("Recours en cours")).toBeVisible();
    const fines = page.locator("section").filter({ has: page.getByRole("heading", { name: "Amendes" }) });
    await fines.getByRole("button", { name: "Marquer comme payée" }).click();
    await expect(fines.getByText("Payée", { exact: true })).toBeVisible();
    await axe(page, "club page");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/discipline-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
