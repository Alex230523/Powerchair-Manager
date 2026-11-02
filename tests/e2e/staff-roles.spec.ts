import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 7 on a phone (390 px): the proposed roles in Réglages › Membres et
 * droits, a role given to a coach, a right taken away from the role after
 * the confirmation that names the person, then the coaches' list with its
 * role badge and the courses' tip at the keyboard (Escape hides it).
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("staff roles, from the settings to the coaches' list", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `roles-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Rôles", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club rôles','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    // A coach with an account.
    const coachUser = (await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES(gen_random_uuid()::text,'Théo Trésor',$1,true) RETURNING id`, [`coach-${Date.now()}@example.test`])).rows[0].id as string;
    const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [coachUser])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, coachUser]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach')", [club, coachUser]);
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Théo Trésor','{coach}')", [club, person]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/settings/members");
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Rôles", exact: true }) }).last();
    await expect(card.getByText("Trésorier", { exact: true })).toBeVisible();
    await axe(page, "roles");
    const theo = card.locator(".staff-people li").filter({ hasText: "Théo Trésor" });
    await theo.getByLabel("Trésorier").check();
    await theo.getByRole("button", { name: /Enregistrer les rôles/ }).click();
    await expect(theo.getByText(/^Peut :/)).toBeVisible();
    // The treasurer loses a right: the confirmation names Théo.
    const treasurer = card.locator(".staff-roles > li").filter({ hasText: "Trésorier" });
    await treasurer.getByRole("button", { name: /^Modifier/ }).click();
    const levels = treasurer.locator(".module-right").filter({ hasText: "Trésorerie et cotisations" });
    await levels.getByLabel("Lecture").check();
    await treasurer.getByRole("button", { name: "Enregistrer le rôle" }).click();
    const confirm = card.getByRole("alertdialog");
    await expect(confirm).toContainText("Théo Trésor");
    await axe(page, "confirmation");
    await confirm.getByRole("button", { name: "Confirmer et appliquer" }).click();
    await expect(confirm).toBeHidden();

    await page.goto("/fr/coaches");
    await expect(page.getByText("Trésorier").first()).toBeVisible();
    await page.mouse.move(0, 0);
    const tip = page.locator(".tip-term").first();
    await tip.focus();
    const bubble = page.locator(`[id="${await tip.getAttribute("aria-describedby")}"]`);
    await expect(bubble).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble).toBeHidden();
    await axe(page, "coaches list");
    await page.screenshot({ path: "test-results/staff-roles-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
