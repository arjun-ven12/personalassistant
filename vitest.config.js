import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PostgreSQL authority tests intentionally exercise concurrent transactions;
    // running database-backed files in parallel makes the shared test pool flaky.
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // External research and local voice dependencies are not Alexa test workspaces.
    exclude: [
      "external-research/**",
      "apps/mac-agent/.local/**",
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
