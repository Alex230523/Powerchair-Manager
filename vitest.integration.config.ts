import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: { PFM_MFA_SUSPENDED: "false" },
    include: ["tests/integration/**/*.integration.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
