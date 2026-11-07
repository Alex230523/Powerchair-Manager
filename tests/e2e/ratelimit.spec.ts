import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";
import { clientKey } from "../../src/lib/rate-limit";

/**
 * Security (07/11/2026), missing rate limiting, on the real server. A
 * president whose account has just sent far too many changes sees, on a phone
 * (390 px), a sentence that asks to wait, and nothing is saved; once the
 * window has passed, the same click saves. A public route refuses an address
 * past its limit with 429 and the seconds to wait. The counters are filled in
 * the database: the robots never wait for a real window.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
/** The counter of a bucket and key, past any limit, for this window and the next. */
const flood = (db: Pool, bucket: string, key: string, window: number) =>
  db.query(
    `INSERT INTO rate_counter(bucket,key,window_start,count)
     SELECT $1,$2,to_timestamp(floor(extract(epoch FROM now())/$3)*$3+$3*k),1000000000 FROM generate_series(0,1) k
     ON CONFLICT (bucket,key,window_start) DO UPDATE SET count=1000000000`,
    [bucket, key, window],
  );

test("too many changes: the president is asked to wait, then saves", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `rate-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Rita Rapide", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,city) VALUES($1,'club','Namur') RETURNING id", [`Club pressé ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/settings/club");
    const form = page.locator("form").filter({ has: page.locator("#club-name") });
    await expect(form.locator("#club-name")).toHaveValue(`Club pressé ${stamp}`);
    // The account has just sent far too many changes.
    await flood(db, "user-write", user, 60);
    await form.locator("#club-name").fill(`Club posé ${stamp}`);
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Trop de demandes en peu de temps. Attendez un moment, puis réessayez.")).toBeVisible();
    expect((await db.query("SELECT name FROM organization WHERE id=$1", [club])).rows[0].name).toBe(`Club pressé ${stamp}`);
    await axe(page, "too many requests");
    // The window has passed: the same click saves.
    await db.query("DELETE FROM rate_counter WHERE bucket='user-write' AND key=$1", [user]);
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect.poll(async () => (await db.query("SELECT name FROM organization WHERE id=$1", [club])).rows[0].name).toBe(`Club posé ${stamp}`);

    // A public route: an address past its limit gets 429 and the seconds to wait; another address does not.
    const ip = "198.51.100.77";
    await flood(db, "public-read", clientKey(new Request("http://x", { headers: { "x-real-ip": ip } })), 60);
    const refused = await page.request.get("/api/public/club/club-inconnu", { headers: { "x-real-ip": ip } });
    expect(refused.status()).toBe(429);
    expect(Number(refused.headers()["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(await refused.json()).toEqual({ error: "RATE_LIMITED" });
    expect((await page.request.get("/api/public/club/club-inconnu", { headers: { "x-real-ip": "198.51.100.78" } })).status()).toBe(404);
  } finally {
    await db.end();
  }
});
