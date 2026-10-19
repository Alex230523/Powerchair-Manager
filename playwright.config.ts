import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
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
