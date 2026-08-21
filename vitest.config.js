import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PostgreSQL authority tests intentionally exercise concurrent transactions;
    // running database-backed files in parallel makes the shared test pool flaky.
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
