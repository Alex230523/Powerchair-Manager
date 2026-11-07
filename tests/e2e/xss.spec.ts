import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Security (07/11/2026), cross-site scripting: a club, a team and a player
 * named with HTML and scripts. The president browses (390 px): every name
 * reads as text, nothing runs, no dialog opens; the pages carry a nonce on
 * every script, a new one at each load, and the browser reports no blocked
 * script of the site itself. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
const payloads = {
  club: `Club <img src=x onerror="window.__xss='club'">`,
  team: `<script>window.__xss='team'</script>Aigles`,
  player: `Dan "><svg onload="window.__xss='player'">`,
};

test("names full of HTML read as text, and only the site's scripts run", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `xss-${stamp}@example.test`;
  const blocked: string[] = [],
    dialogs: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) blocked.push(m.text());
  });
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  try {
    await prepareSignIn(page, db, "XSS Président", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    // Signing in is already React at work: the page's scripts ran with their nonce.
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,city) VALUES($1,'club','Namur') RETURNING id", [payloads.club])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3)", [club, season, payloads.team]);
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles,status) SELECT $1,p.id,$2,'{player}','active' FROM p",
      [club, payloads.player],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. The headers: a nonce on every script, a new one at each load.
    const first = await page.request.get("/fr/teams"),
      second = await page.request.get("/fr/teams");
    const nonceOf = (csp: string | undefined) => csp?.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    const n1 = nonceOf(first.headers()["content-security-policy"]),
      n2 = nonceOf(second.headers()["content-security-policy"]);
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1).not.toBe(n2);
    expect(first.headers()["content-security-policy"]).not.toMatch(/unsafe-inline|unsafe-eval/);
    const html = await first.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(2);
    for (const s of scripts) expect(s).toContain(`nonce="${n1}"`);
    // The names are in the page as text, never as tags.
    expect(html).not.toContain("<script>window.__xss");
    expect(html).not.toContain('<img src=x onerror="window.__xss');

    // 2. The pages where the names show: read as written, nothing runs.
    await page.goto("/fr/teams");
    await expect(page.getByText(payloads.team).first()).toBeVisible();
    for (const path of ["/fr/teams", "/fr/players", "/fr/settings/club", "/fr"]) {
      if (path !== "/fr/teams") await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss), path).toBeUndefined();
      expect(await page.locator("img[src='x'], svg[onload], script:not([src]):not([nonce])").count(), path).toBe(0);
    }
    await page.goto("/fr/teams");
    await axe(page, "teams named with HTML");
    expect(dialogs).toEqual([]);
    // The site's own scripts are never refused: the nonce reaches them all.
    expect(blocked).toEqual([]);

    // 3. A script slipped into a page would find no nonce: the browser refuses it.
    const refused = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          document.addEventListener("securitypolicyviolation", () => resolve(true), { once: true });
          const s = document.createElement("script");
          s.textContent = "window.__xss='injected'";
          document.body.appendChild(s);
          setTimeout(() => resolve(false), 1500);
        }),
    );
    expect(refused).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss)).toBeUndefined();
  } finally {
    await db.end();
  }
});
