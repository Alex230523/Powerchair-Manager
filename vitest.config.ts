import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  // The « @/ » imports of the application (tsconfig paths), for the components a test renders.
  resolve: { alias: { "@/": fileURLToPath(new URL("./src/", import.meta.url)) } },
  test: { include: ["tests/**/*.test.{ts,tsx}"] },
});
