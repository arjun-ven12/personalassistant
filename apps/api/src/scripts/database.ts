import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresDatabase } from "../persistence/database.js";
import { readFile, lstat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { migrationReviewSchema } from "../persistence/migration-review-schema.js";
import { LEGACY_REPAIR } from "../persistence/legacy-repair-review.js";

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
  } else if (command === "inspect-history-schema") {
    const schema = await migrationReviewSchema(database.pool);
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await writeFile(
      ".local/migration-history-schema.json",
      JSON.stringify(schema, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    process.stdout.write(
      "Fixed migration schema metadata saved locally; no application rows read or database mutation.\n",
    );
  } else if (command === "prepare-history-review") {
    // READ-ONLY database inventory. This candidate cannot authorize adoption.
    const applied = await database.pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const files = await database.migrationFiles();
    const migrations = [];
    const missingVersions = [];
    for (const row of applied.rows) {
      const file = files.find((f) => f.version === row.version);
      if (!file) {
        missingVersions.push(row.version);
        continue;
      }
      migrations.push({
        version: row.version,
        digest: createHash("sha256")
          .update(await readFile(file.path))
          .digest("hex"),
      });
    }
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await writeFile(
      ".local/migration-history-review-candidate.json",
      JSON.stringify(
        {
          status: "REVIEW_REQUIRED_NOT_APPROVED",
          migrations,
          missingVersions,
          historicalSqlVerification:
            "CURRENT_SOURCE_HASHES_ONLY_NOT_PROOF_OF_HISTORICAL_SQL",
          ...(missingVersions.includes(LEGACY_REPAIR)
            ? { legacyOriginalSqlStatus: "UNAVAILABLE_NOT_CONTENT_VERIFIED" }
            : {}),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    process.stdout.write(
      "Read-only candidate saved to .local/migration-history-review-candidate.json; NOT an approval or mutation.\n",
    );
  } else if (command === "record-reviewed-history") {
    // Fixed operator-owned review artifact. No arbitrary path argument or public route.
    const filename = ".local/approved-migration-history.json";
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024)
      throw new Error("Migration review artifact denied.");
    await database.recordReviewedHistory(JSON.parse(await readFile(filename, "utf8")));
  } else if (command !== "status") {
    throw new Error(`Unknown database command: ${command}`);
  }
  const status = await database.status();
  process.stdout.write(
    `${JSON.stringify({ state: status.state, applied: status.applied, pending: status.pending, issues: status.issues })}\n`,
  );
  if (
    command !== "prepare-history-review" &&
    command !== "inspect-history-schema" &&
    status.state !== "current"
  )
    process.exitCode = 1;
} finally {
  await database.close();
}
