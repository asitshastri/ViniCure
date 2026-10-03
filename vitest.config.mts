import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { LOG_LEVEL: "silent" },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
