import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresDatabase } from "../persistence/database.js";

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
