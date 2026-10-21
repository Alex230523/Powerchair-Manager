import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Wave 15 (2.8): budget lines with their percentage and colour, the ledger
 * amounts and category badges, the same collection bar on the home and on
 * the dues page, the overdue instalment with an icon, the round tick, the
 * printed report header.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("finance and dues: budget progress, ledger, collection bar, overdue icon, report header", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `finance-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("Finance president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe (12 caractères minimum)", { exact: true }).fill("Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind,company_number,address) VALUES('Finance club','club','0123.456.789','Rue du Stade 1, 1000 Bruxelles') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const startYear = today.slice(5) >= "07-01" ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    const label = `${startYear}-${String(startYear + 1).slice(2)}`;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id", [club, label, `${startYear}-07-01`, `${startYear + 1}-06-30`])).rows[0].id;
    const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',25000,4,$3) RETURNING id", [club, season, `${startYear}-07-01`])).rows[0].id;
    const person = async (name: string) =>
      (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2010-01-01','{player}' FROM p RETURNING id", [club, name])).rows[0].id as string;
    const lucas = await person("Lucas Peeters"),
      emma = await person("Emma Janssens");
    const receivable = async (profile: string, cents: number, dues: string[]) => {
      const id = (
        await db.query("INSERT INTO dues_receivable(organization_id,profile_id,season_id,plan_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',$5,0,$6) RETURNING id", [club, profile, season, plan, cents, user])
      ).rows[0].id as string;
      for (const [i, due] of dues.entries()) await db.query("INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,$2,$3,$4)", [id, i + 1, due, cents / dues.length]);
      return id;
    };
    // Lucas: 250 € in two instalments, the first one long overdue and unpaid. Emma: 100 € paid.
    const lucasDebt = await receivable(lucas, 25000, [`${startYear}-07-01`, `${startYear + 1}-06-15`]);
    const emmaDebt = await receivable(emma, 10000, [`${startYear}-07-15`]);
    const tx = (labelText: string, direction: string, category: string, cents: number, receivableId: string | null = null) =>
      db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by,receivable_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [club, `${startYear}-08-01`, labelText, direction, category, cents, user, receivableId]);
    await tx("Cotisation Emma", "in", "dues", 10000, emmaDebt);
    await tx("Achat de ballons", "out", "equipment", 95000);
    await tx("Location salle", "out", "venue", 1500);
    await tx("Train vers Namur", "out", "travel", 2000);
    for (const [category, cents] of [
      ["equipment", 100000],
      ["venue", 1000],
      ["travel", 10000],
    ] as const)
      await db.query("INSERT INTO finance_budget(organization_id,season,direction,category,amount_cents,updated_by) VALUES($1,$2,'out',$3,$4,$5)", [club, label, category, cents, user]);
    expect(lucasDebt).toBeTruthy();
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The budget: 95 % warning, 15 % over danger, 20 % success, the percentage written each time.
    await page.goto("/fr/funding");
    const budget = page.locator(".budget-table");
    await expect(budget.locator(".budget-progress")).toHaveCount(3);
    await expect(budget.locator('.budget-progress[data-tone="warning"]')).toContainText("95 %");
    await expect(budget.locator('.budget-progress[data-tone="danger"]')).toContainText("150 %");
    await expect(budget.locator('.budget-progress[data-tone="success"]')).toContainText("20 %");
    // 2. The ledger: income in success ink with +, spending in plain text with −, categories as badges.
    await expect(page.locator("td.amount-in").filter({ hasText: "+" }).first()).toBeVisible();
    await expect(page.locator("td.amount-spent").filter({ hasText: "−" }).first()).toBeVisible();
    await expect(page.locator(".ledger .badge").filter({ hasText: "Matériel" }).first()).toBeVisible();
    await axe(page, "finance");

    // 3. The same collection bar on the home and on the dues page.
    await page.goto("/fr");
    const home = page.locator(".finance-card .collection-bar");
    await expect(home).toBeVisible();
    const homeText = (await home.innerText()).replace(/\s+/g, " ");
    await page.goto("/fr/dues");
    const dues = page.locator("#dues-collection .collection-bar");
    await expect(dues).toBeVisible();
    expect((await dues.innerText()).replace(/\s+/g, " ")).toBe(homeText);
    await expect(dues).toContainText("29 % encaissé");
    await expect(dues.locator("[data-late]")).toContainText("125,00");
    // 4. The overdue instalment: danger ink and an icon; the round tick names the player.
    const row = page.locator(".dues-table tbody tr").filter({ hasText: "Lucas Peeters" });
    await expect(row.locator(".danger-ink svg")).toHaveCount(1);
    await expect(row.getByRole("button", { name: /^Encaisser la prochaine échéance de Lucas Peeters/ })).toBeVisible();
    await axe(page, "dues");

    // 5. The printed report: the club's letterhead appears in print only.
    await page.goto(`/fr/funding/report?season=${label}`);
    const head = page.locator(".report-letterhead");
    await expect(head).toBeHidden();
    await page.emulateMedia({ media: "print" });
    await expect(head).toBeVisible();
    await expect(head).toContainText("Finance club");
    await expect(head).toContainText("0123.456.789");
    await page.emulateMedia({ media: "screen" });
    await axe(page, "report");
  } finally {
    await db.end();
  }
});
