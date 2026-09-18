import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "./database.js";
import { safeTestDatabaseUrl } from "./test-database.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)(
  "workspace blocked-pattern backfill migration",
  () => {
    let administrationDatabase: PostgresDatabase;
    let database: PostgresDatabase;
    let testSchema: string;
    let migrationSql: string;

    beforeAll(async () => {
      administrationDatabase = new PostgresDatabase(connectionString!);
      testSchema = `workspace_backfill_${crypto.randomUUID().replaceAll("-", "")}`;
      await administrationDatabase.pool.query(`CREATE SCHEMA "${testSchema}"`);
      const isolatedUrl = new URL(connectionString!);
      isolatedUrl.hostname = isolatedUrl.hostname.replace("-pooler.", ".");
      if (isolatedUrl.searchParams.get("sslmode") !== "disable")
        isolatedUrl.searchParams.set("sslmode", "verify-full");
      isolatedUrl.searchParams.set("options", `-c search_path=${testSchema}`);
      database = new PostgresDatabase(isolatedUrl.toString());
      await database.pool.query(`
      CREATE TABLE workspaces (
        id text PRIMARY KEY,
        owner_id uuid NOT NULL,
        enabled boolean NOT NULL,
        record jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        version integer NOT NULL DEFAULT 1
      )
    `);
      const migrationPath = path.resolve(
        process.cwd(),
        path.basename(process.cwd()) === "api"
          ? "migrations/0100_backfill_workspace_external_research_pattern.sql"
          : "apps/api/migrations/0100_backfill_workspace_external_research_pattern.sql",
      );
      migrationSql = await readFile(migrationPath, "utf8");
    }, 30_000);

    afterAll(async () => {
      await database?.close();
      if (administrationDatabase && testSchema) {
        await administrationDatabase.pool.query(`DROP SCHEMA "${testSchema}" CASCADE`);
        await administrationDatabase.close();
      }
    });

    it("backfills old records once while preserving compliant and custom patterns", async () => {
      const ownerId = crypto.randomUUID();
      const timestamp = "2026-09-01T00:00:00.000Z";
      const records = [
        { id: "old", blockedPatterns: [".env"] },
        { id: "compliant", blockedPatterns: [".env", "external-research/"] },
        { id: "custom", blockedPatterns: [".env", "private-notes/"] },
      ];
      for (const item of records) {
        await database.pool.query(
          `INSERT INTO workspaces(id,owner_id,enabled,record,created_at,updated_at,version)
         VALUES ($1,$2,true,$3,$4,$4,1)`,
          [
            item.id,
            ownerId,
            { id: item.id, ownerId, blockedPatterns: item.blockedPatterns },
            timestamp,
          ],
        );
      }

      await database.pool.query(migrationSql);
      await database.pool.query(migrationSql);

      const result = await database.pool.query<{
        id: string;
        record: { blockedPatterns: string[] };
        version: number;
        updated_at: Date;
      }>("SELECT id,record,version,updated_at FROM workspaces ORDER BY id");
      const byId = new Map(result.rows.map((row) => [row.id, row]));

      expect(byId.get("old")?.record.blockedPatterns).toEqual([
        ".env",
        "external-research/",
      ]);
      expect(byId.get("custom")?.record.blockedPatterns).toEqual([
        ".env",
        "private-notes/",
        "external-research/",
      ]);
      expect(byId.get("compliant")?.record.blockedPatterns).toEqual([
        ".env",
        "external-research/",
      ]);
      expect(byId.get("compliant")?.version).toBe(1);
      expect(byId.get("compliant")?.updated_at.toISOString()).toBe(timestamp);
      expect(byId.get("old")?.version).toBe(2);
      expect(byId.get("custom")?.version).toBe(2);
      for (const row of result.rows)
        expect(
          row.record.blockedPatterns.filter(
            (pattern) => pattern === "external-research/",
          ),
        ).toHaveLength(1);
    });
  },
);
