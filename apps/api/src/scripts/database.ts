import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresDatabase } from "../persistence/database.js";
import { readFile, lstat } from "node:fs/promises";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const environment = parseApiEnvironment({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
});
if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const command = process.argv[2] ?? "status";
const database = new PostgresDatabase(environment.DATABASE_URL);
try {
  if (command === "migrate" || command === "deploy") {
    await database.migrate();
  } else if (command === "record-reviewed-history") {
    // Fixed operator-owned review artifact. No arbitrary path argument or public route.
    const filename = ".local/approved-migration-history.json";
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error("Migration review artifact denied.");
    await database.recordReviewedHistory(JSON.parse(await readFile(filename, "utf8")));
  } else if (command !== "status") {
    throw new Error(`Unknown database command: ${command}`);
  }
  const status = await database.status();
  process.stdout.write(
    `${JSON.stringify({ state: status.state, applied: status.applied, pending: status.pending })}\n`,
  );
  if (status.state !== "current") process.exitCode = 1;
} finally {
  await database.close();
}
