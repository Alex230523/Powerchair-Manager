import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 2 on a phone (390 px): a template applied on demand with one person per
 * line, a task with two people in charge (« 1/2 faits »), the year at a
 * glance. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("templates on demand, several people, the year", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `todo-more-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Tâches", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des tâches','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const people: string[] = [];
    for (const name of ["Ana Chauffeur", "Bram Chauffeur"]) {
      const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
      people.push((await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,$3,'{coach}') RETURNING id", [club, person, name])).rows[0].id);
    }
    await db.query("INSERT INTO task_template(organization_id,kind,name,items,created_by) VALUES($1,'transport','Déplacement',$2,$3)", [
      club,
      JSON.stringify([
        { title: "Réserver le minibus", detail: "", daysBefore: 14 },
        { title: "Confirmer les chauffeurs", detail: "", daysBefore: 3 },
      ]),
      user,
    ]);
    const shared = (await db.query("INSERT INTO task(organization_id,kind,category,title,due_on,created_by,completion,responsible_id) VALUES($1,'other','events','Conduire au tournoi',CURRENT_DATE+10,$2,'each',$3) RETURNING id", [club, user, people[0]])).rows[0].id;
    await db.query("INSERT INTO task_assignee(task_id,organization_id,profile_id,done_on) VALUES($1,$2,$3,CURRENT_DATE)", [shared, club, people[1]]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/tasks");
    await expect(page.getByText("Conduire au tournoi")).toBeVisible();
    await expect(page.getByText("1/2 faits")).toBeVisible();
    await axe(page, "tasks");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // A template on demand: one person on the first line, the second line skipped.
    await page.getByRole("button", { name: "Depuis un modèle" }).click();
    const dialog = page.getByRole("dialog", { name: "Depuis un modèle" });
    await expect(dialog.getByRole("group", { name: /Réserver le minibus/ })).toBeVisible();
    await axe(page, "from template");
    const reference = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 1)).toISOString().slice(0, 10);
    await dialog.getByLabel("Date de référence").fill(reference);
    await dialog.getByRole("group", { name: /Réserver le minibus/ }).getByLabel("Ana Chauffeur").check();
    await dialog.getByRole("group", { name: /Confirmer les chauffeurs/ }).getByLabel("Ne pas créer cette ligne").check();
    await dialog.getByRole("button", { name: "Créer les tâches" }).click();
    await expect(page.getByText("Réserver le minibus")).toBeVisible();
    await expect(page.getByText("Confirmer les chauffeurs")).toHaveCount(0);
    const made = (await db.query("SELECT a.profile_id FROM task t JOIN task_assignee a ON a.task_id=t.id WHERE t.organization_id=$1 AND t.title='Réserver le minibus'", [club])).rows;
    expect(made.map((r) => r.profile_id)).toEqual([people[0]]);

    // The year at a glance.
    await page.getByRole("button", { name: "Année", exact: true }).click();
    const year = page.getByRole("dialog", { name: "L'année d'un coup d'œil" });
    await expect(year.getByText("Réserver le minibus")).toBeVisible();
    await expect(year.getByRole("link", { name: "Calendrier administratif (PDF)" })).toBeVisible();
    await axe(page, "year");
    await page.screenshot({ path: "test-results/todo-more-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
