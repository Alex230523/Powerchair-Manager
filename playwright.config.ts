import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  // On GitHub Actions failures also appear as annotations on the pull request.
  reporter: process.env.GITHUB_ACTIONS ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    env: {
      PFM_BUILD_DIR: ".next-e2e",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "test-only-secret-at-least-32-characters-long",
      PFM_LOCAL_MAIL: "true",
      PFM_MAIL_DIR: ".local/mail-e2e",
      // The internal design gallery is opened by the suite (hidden in production otherwise).
      PFM_DESIGN_PAGE: "true",
      // Security (07/11/2026): the robots go far faster than a person; the limits are raised, never removed.
      PFM_RATE_LIMIT_SCALE: process.env.PFM_RATE_LIMIT_SCALE ?? "1000",
      DATABASE_URL:
        process.env.PFM_E2E_DATABASE_URL ??
        "postgresql://127.0.0.1:1/unavailable",
    },
    command: "npm run build && npm start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 300000,
  },
});
