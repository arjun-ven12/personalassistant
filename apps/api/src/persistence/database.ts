import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const { Pool } = pg;

export interface MigrationStatus {
  state: "current" | "outdated" | "unknown";
  applied: string[];
  pending: string[];
}

export class PostgresDatabase {
  readonly pool: pg.Pool;

  constructor(
    connectionString: string,
    options: {
      poolSize?: number;
      sslMode?: "disable" | "require" | "verify-full";
    } = {},
  ) {
    const parsedConnection = new URL(connectionString);
    const startupOptions = parsedConnection.searchParams.get("options") ?? undefined;
    this.pool = new Pool({
      connectionString,
      ...(startupOptions ? { options: startupOptions } : {}),
      max: options.poolSize ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "personal-assistant-api",
      ssl:
        options.sslMode && options.sslMode !== "disable"
          ? { rejectUnauthorized: options.sslMode === "verify-full" }
          : undefined,
    });
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async pgvectorStatus() {
    const result = await this.pool.query<{ exists: string | null }>(
      "SELECT to_regtype('vector')::text AS exists",
    );
    return result.rows[0]?.exists === "vector" ? "ready" : "unavailable";
  }

  async migrationFiles() {
    const directory =
      path.basename(process.cwd()) === "api"
        ? path.resolve(process.cwd(), "migrations")
        : path.resolve(process.cwd(), "apps/api/migrations");
    return (await readdir(directory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort()
      .map((file) => ({
        version: file.replace(/\.sql$/, ""),
        path: path.join(directory, file),
      }));
  }

  async status(): Promise<MigrationStatus> {
    try {
      const files = await this.migrationFiles();
      const exists = await this.pool.query<{ exists: string | null }>(
        "SELECT to_regclass('schema_migrations')::text AS exists",
      );
      if (!exists.rows[0]?.exists) {
        return {
          state: "outdated",
          applied: [],
          pending: files.map((file) => file.version),
        };
      }
      const appliedResult = await this.pool.query<{ version: string }>(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      const applied = appliedResult.rows.map((row) => row.version);
      const pending = files
        .map((file) => file.version)
        .filter((version) => !applied.includes(version));
      return { state: pending.length === 0 ? "current" : "outdated", applied, pending };
    } catch {
      return { state: "unknown", applied: [], pending: [] };
    }
  }

  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(204002)");
      const files = await this.migrationFiles();
      const exists = await client.query<{ exists: string | null }>(
        "SELECT to_regclass('schema_migrations')::text AS exists",
      );
      const applied = new Set<string>();
      if (exists.rows[0]?.exists) {
        const result = await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations ORDER BY version",
        );
        for (const row of result.rows) applied.add(row.version);
      }
      for (const file of files) {
        if (applied.has(file.version)) continue;
        const sql = await readFile(file.path, "utf8");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
          [file.version],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
