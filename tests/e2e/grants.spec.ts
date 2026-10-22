import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn, signUpVia } from "../support/session";

/**
 * Wave 15 (C2): an ADEPS grant, the standard check-list, a step given to the
 * coach and seen on his home, next year's file prepared from it.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  const violations = (await (within ? builder.include(within) : builder).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("grant file: standard check-list, a step for the coach, his home, next year", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const coachContext = await browser.newContext({ baseURL: origin }),
    coachPage = await coachContext.newPage();
  const email = `grants-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Grants president", email, "Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const r = await signUpVia(coachPage, db, {
      headers: { origin },
      data: { name: "Sam Coach", email: `grants-coach-${Date.now()}@example.test`, password: "Browser-test-passphrase-2026!" },
    });
    expect(r.status()).toBe(200);
    const coach = (await r.json()).user.id as string;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=ANY($1)', [[user, coach]]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Grants club','club') RETURNING id")).rows[0].id;
    const mandates: string[] = [];
    for (const [u, role] of [
      [user, "club_president"],
      [coach, "coach"],
    ]) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, u]);
      mandates.push((await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [club, u, role])).rows[0].id);
    }
    // The coach's club profile, so a step can be given to him.
    const person =
      (await db.query("SELECT id FROM person WHERE user_id=$1", [coach])).rows[0]?.id ??
      (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [coach])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Sam Coach','1990-01-01','{coach}')", [club, person]);
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    expect((await coachPage.request.post("/api/workspace", { headers: { origin }, data: { action: "context", mandateId: mandates[1] } })).status()).toBe(200);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandates[0])]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A new ADEPS file, deadline in ten days.
    await page.goto("/fr/funding/grants");
    await page.getByRole("button", { name: "Nouvelle demande", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Nouvelle demande" });
    await form.getByLabel(/^Organisme/).fill("ADEPS");
    await form.getByLabel("Appel ou programme", { exact: true }).fill("Équipement sportif");
    await form.getByLabel("Lien vers l’appel", { exact: true }).fill("https://www.adeps.be");
    await form.getByLabel("Montant demandé (€)", { exact: true }).fill("8000");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const plus = (n: number) => {
      const d = new Date(today + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    await form.getByLabel("Date limite de dépôt", { exact: true }).fill(plus(10));
    await axe(page, "grant form", "dialog[open]");
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(form).toHaveCount(0);
    const row = page.locator(".grants-table tbody tr").filter({ hasText: "ADEPS · Équipement sportif" });
    await expect(row).toContainText("Dans moins de 14 jours");
    // A2: the « Tâches (n) » button of the row.
    await expect(row.getByRole("link", { name: "Tâches de ADEPS · Équipement sportif (0)" })).toBeVisible();
    await axe(page, "grants list");

    // 2. The sheet: the standard check-list.
    await row.getByRole("button", { name: /^ADEPS · Équipement sportif/ }).click();
    const sheet = page.getByRole("dialog", { name: "ADEPS · Équipement sportif" });
    await expect(sheet.getByRole("link", { name: /Lien vers l’appel/ })).toBeVisible();
    await axe(page, "grant sheet details", "dialog[open]");
    await sheet.getByRole("tab", { name: /^Check-list/ }).click();
    await sheet.getByRole("button", { name: "Ajouter la check-list type" }).click();
    await expect(sheet.locator(".task-list li")).toHaveCount(8);
    await axe(page, "grant check-list", "dialog[open]");

    // 3. "Déposer le dossier" goes to the coach, due in five days.
    await sheet.getByRole("button", { name: "Modifier la tâche : Déposer le dossier" }).click();
    const step = page.getByRole("dialog", { name: "Modifier la tâche · Déposer le dossier" });
    await step.getByLabel("À faire pour le", { exact: true }).fill(plus(5));
    const who = step.getByRole("combobox", { name: /^Responsable/ });
    await who.selectOption((await who.locator("option", { hasText: "Sam Coach" }).getAttribute("value")) ?? "");
    await step.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(step).toHaveCount(0);
    await expect(sheet.locator(".task-list li").filter({ hasText: "Déposer le dossier" })).toContainText("Sam Coach");
    await sheet.getByRole("checkbox", { name: "Lire l’appel et ses conditions" }).check();
    await expect(sheet.getByText("1 sur 8").first()).toBeVisible();
    await sheet.getByRole("tab", { name: /^Historique/ }).click();
    await expect(sheet.locator(".history-list li").first()).toBeVisible();
    await axe(page, "grant history", "dialog[open]");

    // 4. The coach sees his step on his home and ticks it on the tasks page.
    await coachPage.setViewportSize({ width: 1280, height: 900 });
    await coachPage.goto("/fr");
    // Wave 16 (A): sponsors and grants share one square.
    const todo = coachPage.locator(".todo-card").filter({ hasText: "Sponsors et subsides" });
    await expect(todo).toBeVisible();
    await todo.click();
    await expect(coachPage).toHaveURL("/fr/tasks?kind=grant");
    await expect(coachPage.locator(".task-page li")).toHaveCount(1);
    await expect(coachPage.locator(".task-page li")).toContainText("Déposer le dossier");
    await axe(coachPage, "coach tasks");
    await coachPage.getByRole("checkbox", { name: "Déposer le dossier" }).check();
    await expect(coachPage.locator(".task-page li")).toHaveCount(0);

    // 5. Next year's file, from the sheet.
    await sheet.getByRole("tab", { name: /^Détail/ }).click();
    await sheet.getByRole("button", { name: "Préparer l’année prochaine" }).click();
    await expect(sheet.getByRole("button", { name: "Ouvrir le dossier de l’année prochaine" })).toBeVisible();
    await sheet.getByRole("button", { name: "Ouvrir le dossier de l’année prochaine" }).click();
    await sheet.getByRole("tab", { name: /^Check-list/ }).click();
    await expect(page.locator("dialog[open] .task-list li")).toHaveCount(8);
    await expect(page.locator("dialog[open] .task-list input:checked")).toHaveCount(0);
    await page.locator("dialog[open]").getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(page.locator(".grants-table tbody tr").filter({ hasText: "ADEPS · Équipement sportif" })).toHaveCount(2);

    // 6. 390 px: the list scrolls inside its card.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/funding/grants");
    await expect(page.locator(".grants-table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await coachContext.close();
    await db.end();
  }
});
