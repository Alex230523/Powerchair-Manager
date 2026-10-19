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
    await expect(page.locator("header select")).toHaveCount(0);
    await expect(
      page.locator("nav").getByRole("link", { name: "English", exact: true }),
    ).toHaveCount(0);
    await page.goto(`/${locale}/access`);
    await page.locator("main select").selectOption("en");
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
  expect(await response.json()).toEqual(
    process.env.PFM_E2E_DATABASE_URL
      ? { status: "ok", database: "reachable" }
      : { status: "unavailable" },
  );
});
