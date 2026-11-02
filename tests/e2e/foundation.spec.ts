import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const locale of ["fr", "nl", "en"])
  test(`${locale}: navigation and accessibility`, async ({ page }) => {
    await page.goto("/" + locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/foundation-${locale}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Wave 16 (I1): a visitor has no menu, only the brand, the language (a discreet « FR ») and « Se connecter ».
    await expect(page.locator("header .lang-menu summary")).toHaveText(locale.toUpperCase());
    await expect(page.locator(".sidebar, .bottom-nav")).toHaveCount(0);
    await page.goto(`/${locale}/access`);
    await page.locator("header .lang-menu summary").click();
    await page.locator("header .lang-menu").getByRole("link", { name: /English/ }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
test("root redirects and unsupported locale is rejected", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/fr");
  const response = await page.goto("/de");
  expect(response?.status()).toBe(404);
});

test("database outage is explicit and redacted", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(process.env.PFM_E2E_DATABASE_URL ? 200 : 503);
  // B2: with a database, the health also reports the jobs and the e-mail budget.
  const body = await response.json();
  if (process.env.PFM_E2E_DATABASE_URL) {
    expect(body).toMatchObject({ database: "reachable" });
    expect(["ok", "degraded"]).toContain(body.status);
    expect(body).toHaveProperty("jobs");
    expect(body).toHaveProperty("mail");
  } else expect(body).toEqual({ status: "unavailable" });
});
