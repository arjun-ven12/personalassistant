import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

import pg from "pg";
import { transactionalPool, type UnitOfWork } from "./unit-of-work.js";

const { Pool } = pg;

export interface MigrationStatus {
  state: "current" | "outdated" | "unknown";
  applied: string[];
  pending: string[];
  issues?: string[];
}
export const ReviewedMigrationHistorySchema = z.object({
  acknowledgement: z.literal("OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY"),
  migrations: z.array(z.object({ version: z.string().regex(/^\d+[a-z0-9_]*$/), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(1000),
}).strict();

export class PostgresDatabase {
  readonly pool: pg.Pool;
  readonly transaction: UnitOfWork;

  constructor(
    connectionString: string,
    options: {
      poolSize?: number;
      connectionTimeoutMillis?: number;
      sslMode?: "disable" | "require" | "verify-full";
    } = {},
  ) {
    const parsedConnection = new URL(connectionString);
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsedConnection.hostname);
    const urlMode = parsedConnection.searchParams.get("sslmode");
    const mode = options.sslMode ?? urlMode ?? (loopback ? "disable" : "verify-full");
    if (!["disable", "require", "verify-full"].includes(mode) || (mode === "disable" && !loopback))
      throw new Error("DATABASE_TLS_CONFIGURATION_DENIED");
    for (const key of ["ssl", "sslcert", "sslkey", "sslrootcert"])
      if (parsedConnection.searchParams.has(key)) throw new Error("DATABASE_TLS_URL_OVERRIDE_DENIED");
    // pg connection-string SSL options otherwise override explicit verification.
    parsedConnection.searchParams.delete("sslmode");
    parsedConnection.searchParams.delete("uselibpqcompat");
    const startupOptions = parsedConnection.searchParams.get("options") ?? undefined;
    const rawPool = new Pool({
      connectionString: parsedConnection.toString(),
      ...(startupOptions ? { options: startupOptions } : {}),
      max: options.poolSize ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
      application_name: "personal-assistant-api",
      // `require` remains a compatibility spelling but never disables identity verification.
      ssl: mode === "disable" ? false : { rejectUnauthorized: true },
    });
    const unit = transactionalPool(rawPool);
    this.pool = unit.pool;
    this.transaction = unit.run;
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
      const issues: string[] = [];
      if (applied.some(version => !files.some(file => file.version === version))) issues.push("UNEXPECTED_APPLIED_VERSION");
      const column = await this.pool.query<{ present: boolean }>("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='schema_migrations' AND column_name='content_sha256') AS present");
      if (applied.length && !column.rows[0]?.present) issues.push("REVIEWED_HISTORY_REQUIRED");
      else if (column.rows[0]?.present) {
        const digests = await this.pool.query<{ version: string; content_sha256: string | null }>("SELECT version,content_sha256 FROM schema_migrations");
        for (const row of digests.rows) {
          const file = files.find(v => v.version === row.version);
          if (!file) continue;
          const digest = createHash("sha256").update(await readFile(file.path)).digest("hex");
          if (row.content_sha256 !== digest) issues.push(row.content_sha256 ? "APPLIED_SQL_DIGEST_MISMATCH" : "REVIEWED_HISTORY_REQUIRED");
        }
      }
      return { state: issues.length ? "unknown" : pending.length === 0 ? "current" : "outdated", applied, pending, ...(issues.length ? { issues: [...new Set(issues)] } : {}) };
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
      const hashes = new Map<string, string>();
      for (const file of files) hashes.set(file.version, createHash("sha256").update(await readFile(file.path)).digest("hex"));
      if ([...applied].some(version => !hashes.has(version))) throw new Error("MIGRATION_LINEAGE_DENIED");
      if (applied.size) {
        const column = await client.query<{ present: boolean }>("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='schema_migrations' AND column_name='content_sha256') AS present");
        if (!column.rows[0]?.present) throw new Error("REVIEWED_MIGRATION_HISTORY_REQUIRED");
        const prior = await client.query<{ version: string; content_sha256: string | null }>("SELECT version,content_sha256 FROM schema_migrations");
        if (prior.rows.some(row => row.content_sha256 !== hashes.get(row.version))) throw new Error("MIGRATION_DIGEST_UNKNOWN_OR_MISMATCH");
      }
      const newlyApplied: string[] = [];
      for (const file of files) {
        if (applied.has(file.version)) continue;
        const sql = await readFile(file.path, "utf8");
        if (createHash("sha256").update(sql).digest("hex") !== hashes.get(file.version)) throw new Error("MIGRATION_SOURCE_CHANGED_DURING_DEPLOY");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
          [file.version],
        );
        newlyApplied.push(file.version);
      }
      // Fresh history is hashed only from SQL actually executed in this transaction.
      for (const version of newlyApplied) await client.query("UPDATE schema_migrations SET content_sha256=$2 WHERE version=$1", [version, hashes.get(version)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  /** Operator-only adoption of legacy history, after exact SQL and recovery review. Never an API/model tool. */
  async recordReviewedHistory(raw: unknown) {
    const manifest = ReviewedMigrationHistorySchema.parse(raw);
    const files = await this.migrationFiles();
    const expected = new Map<string, string>();
    for (const file of files) expected.set(file.version, createHash("sha256").update(await readFile(file.path)).digest("hex"));
    if (new Set(manifest.migrations.map(v => v.version)).size !== manifest.migrations.length || manifest.migrations.some(v => expected.get(v.version) !== v.digest)) throw new Error("REVIEWED_MIGRATION_MANIFEST_MISMATCH");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(204002)");
      const applied = await client.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
      if (applied.rows.length !== manifest.migrations.length || applied.rows.some(v => !manifest.migrations.some(m => m.version === v.version))) throw new Error("REVIEWED_MIGRATION_LINEAGE_MISMATCH");
      await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS content_sha256 char(64)");
      const current = await client.query<{ version: string; content_sha256: string | null }>("SELECT version,content_sha256 FROM schema_migrations");
      if (current.rows.some(v => v.content_sha256 !== null && v.content_sha256 !== expected.get(v.version))) throw new Error("EXISTING_MIGRATION_DIGEST_CANNOT_BE_REWRITTEN");
      for (const item of manifest.migrations) await client.query("UPDATE schema_migrations SET content_sha256=$2 WHERE version=$1 AND content_sha256 IS NULL", [item.version, item.digest]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async close() {
    await this.pool.end();
  }
}
