import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Audits 23 and 26 (npm run audit:ui, npm run audit:access): the same
 * server as the end-to-end tests, on a database holding the demo
 * (scripts/audit.mjs); one role per worker.
 */
export default defineConfig({
  ...base,
  testDir: "tests/audit",
  globalSetup: "./tests/audit/global-setup.ts",
  workers: 4,
  fullyParallel: true,
  reporter: process.env.GITHUB_ACTIONS ? [["github"], ["list"]] : "list",
});
