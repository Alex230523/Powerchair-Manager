import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn, createAccount } from "../support/session";

/**
 * Wave 17 (G3): Relances moved to Settings > Notifications (the old address
 * leads there), the offline book is gone, the reminder box holds at 1440 and
 * 390 px, light and dark, very large text; rights last « jusqu'à nouvel
 * ordre » unless an end date is chosen.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
/** Nothing of the reminders sticks out of its card or of the page. */
async function fits(page: Page, label: string) {
  const over = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`page ${document.documentElement.scrollWidth}`);
    for (const card of document.querySelectorAll<HTMLElement>(".reminders .card")) {
      const box = card.getBoundingClientRect();
      for (const el of card.querySelectorAll<HTMLElement>("label, input, select, textarea, button, .badge, .row-actions, .table-scroll")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > box.right + 1 || r.left < box.left - 1)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(r.right)} > ${Math.round(box.right)}`);
      }
    }
    return out;
  });
  expect(over, label).toEqual([]);
}

test("menu without Relances nor offline book, reminders in Settings, rights until further notice", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `g3-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "G3 president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('G3 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    // A player whose family has a very long address, late on his dues.
    const player = (
      await db.query(
        "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,directory_roles) SELECT $1,p.id,'Maximilien-Alexandre de la Tour-Dupont',$2::date,$3,'{player}' FROM p RETURNING id",
        [club, "2008-04-01", "maximilien.alexandre.de.la.tour.dupont.famille@exemple-tres-long.example.test"],
      )
    ).rows[0].id;
    // A coach, with rights and no end date.
    const coachEmail = `g3-coach-${Date.now()}@example.test`;
    const coach = await createAccount(db, "Coach Durée", coachEmail, "Browser-test-passphrase-2026!");
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, coach.id]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,'coach','{attendance.manage}')", [club, coach.id]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    const post = async (data: Record<string, unknown>) => {
      const r = await page.request.post("/api/dues", { headers: { origin }, data: { organizationId: club, ...data } });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    const due = (await db.query("SELECT (CURRENT_DATE-10)::text AS d")).rows[0].d;
    const plan = (await post({ action: "plan", seasonId: season, category: "Cotisation annuelle des joueurs adultes", amountCents: 32000, maxInstallments: 2, firstDue: due })).id;
    await post({ action: "issue", planId: plan, profileId: player, installments: 1, firstDue: due });
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. The menu: neither Relances nor the offline book; the old addresses.
    await page.goto("/fr");
    await expect(page.locator('a[href="/fr/reminders"]')).toHaveCount(0);
    await expect(page.locator('a[href="/fr/offline-book"]')).toHaveCount(0);
    expect((await page.goto("/fr/offline-book"))?.status()).toBe(404);
    await page.goto("/fr/reminders?kind=dues");
    await expect(page).toHaveURL(/\/fr\/settings\/notifications\?kind=dues#settings-reminders$/);
    const reminders = page.locator("section.reminders");
    await expect(reminders.getByRole("heading", { name: "Relances", level: 2 })).toBeVisible();
    await expect(reminders.getByRole("checkbox", { name: "Maximilien-Alexandre de la Tour-Dupont" })).toBeChecked();
    await axe(page, "reminders in settings");

    // 2. The reminder box at 1440 and 390 px, light and dark, very large text.
    for (const [width, scheme, size] of [
      [1440, "light", "normal"],
      [390, "light", "normal"],
      [390, "dark", "xlarge"],
      [1440, "dark", "xlarge"],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((z) => localStorage.setItem("pfm-text-size", z), size);
      await page.goto("/fr/settings/notifications?kind=dues");
      await expect(reminders.getByRole("checkbox", { name: "Maximilien-Alexandre de la Tour-Dupont" })).toBeVisible();
      await fits(page, `${width} ${scheme} ${size}`);
      await reminders.screenshot({ path: `test-results/reminders-${width}-${scheme}-${size}.png` });
    }
    await page.evaluate(() => localStorage.removeItem("pfm-text-size"));
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 900 });

    // 3. Rights: « Jusqu'à nouvel ordre » by default, an end date only when chosen.
    await page.goto("/fr/settings/members");
    const row = page.getByRole("row").filter({ hasText: "Coach Durée" });
    await expect(row).toContainText("Jusqu'à nouvel ordre");
    await row.getByRole("button", { name: /^Choisir ses droits/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "Jusqu'à nouvel ordre" })).toBeChecked();
    await expect(dialog.getByLabel("Date de fin")).toHaveCount(0);
    await dialog.getByRole("radio", { name: "Jusqu'au…" }).check();
    const end = (await db.query("SELECT to_char(CURRENT_DATE+90,'YYYY-MM-DD') AS d, to_char(CURRENT_DATE+90,'DD/MM/YYYY') AS shown")).rows[0];
    await dialog.getByLabel("Date de fin").fill(end.d);
    await axe(page, "rights dialog");
    await dialog.getByRole("button", { name: /^Enregistrer les accès/ }).click();
    await expect(page.getByRole("row").filter({ hasText: "Coach Durée" })).toContainText(`Jusqu'au ${end.shown}`);
    // The journal says it too.
    await page.goto("/fr/settings/journals");
    await expect(page.locator('section[aria-labelledby="journal-rights"]').getByRole("row").filter({ hasText: "Rôle prolongé" }).first()).toContainText(`Jusqu'au ${end.shown}`);
    // Back to « jusqu'à nouvel ordre ».
    await page.goto("/fr/settings/members");
    await page.getByRole("row").filter({ hasText: "Coach Durée" }).getByRole("button", { name: /^Choisir ses droits/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Jusqu'à nouvel ordre" }).check();
    await page.getByRole("dialog").getByRole("button", { name: /^Enregistrer les accès/ }).click();
    await expect(page.getByRole("row").filter({ hasText: "Coach Durée" })).toContainText("Jusqu'à nouvel ordre");
    expect((await db.query("SELECT valid_until FROM role_assignment WHERE organization_id=$1 AND role='coach'", [club])).rows[0].valid_until).toBeNull();
  } finally {
    await db.end();
  }
});
