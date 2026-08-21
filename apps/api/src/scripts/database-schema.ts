import { PostgresDatabase } from "../persistence/database.js";

const database = Object.create(PostgresDatabase.prototype) as PostgresDatabase;
const files = await database.migrationFiles();
if (files.length === 0) throw new Error("No database migrations were found.");
const versions = files.map((file) => file.version);
if (new Set(versions).size !== versions.length) {
  throw new Error("Database migration versions must be unique.");
}
process.stdout.write(
  `Validated ${files.length} source-controlled SQL migration(s): ${versions.join(", ")}\n`,
);
