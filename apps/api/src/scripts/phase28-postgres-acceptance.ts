import { spawn } from "node:child_process";
import path from "node:path";

import { safeTestDatabaseUrl } from "../persistence/test-database.js";

if (!safeTestDatabaseUrl())
  throw new Error("TEST_DATABASE_URL_REQUIRED_FOR_PHASE_28_ACCEPTANCE");

const files = [
  "apps/api/src/persistence/postgres.integration.test.ts",
  "apps/api/src/persistence/unit-of-work.integration.test.ts",
  "apps/api/src/workforce-runtime/postgres-store.integration.test.ts",
  "apps/api/src/integrations/phase26-2.postgres.integration.test.ts",
  "apps/api/src/launch-workflow/postgres-store.integration.test.ts",
  "apps/api/src/launch-workflow/phase28-postgres-acceptance.integration.test.ts",
];
const runner = path.resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const child = spawn(
  process.execPath,
  [runner, "run", ...files, "--no-file-parallelism"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);
const exitCode = await new Promise<number>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
