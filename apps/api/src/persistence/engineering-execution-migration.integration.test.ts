import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "./database.js";
import { safeTestDatabaseUrl } from "./test-database.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)(
  "engineering execution-request compatibility migration",
  () => {
    let administrationDatabase: PostgresDatabase;
    let database: PostgresDatabase;
    let testSchema: string;
    let migrationSql: string;

    beforeAll(async () => {
      administrationDatabase = new PostgresDatabase(connectionString!);
      testSchema = `engineering_execution_${crypto.randomUUID().replaceAll("-", "")}`;
      await administrationDatabase.pool.query(`CREATE SCHEMA "${testSchema}"`);
      const isolatedUrl = new URL(connectionString!);
      isolatedUrl.hostname = isolatedUrl.hostname.replace("-pooler.", ".");
      if (isolatedUrl.searchParams.get("sslmode") !== "disable")
        isolatedUrl.searchParams.set("sslmode", "verify-full");
      isolatedUrl.searchParams.set("options", `-c search_path=${testSchema}`);
      database = new PostgresDatabase(isolatedUrl.toString());
      await database.pool.query(`
        CREATE TABLE execution_requests (
          id uuid PRIMARY KEY,
          tool_name varchar(100) NOT NULL,
          CONSTRAINT execution_requests_tool_name_check CHECK (tool_name IN (
            'workspace.inspect_metadata',
            'workspace.read_file',
            'git.status',
            'git.diff',
            'git.current_branch',
            'repository.scan_metadata',
            'workspace.apply_patch',
            'workspace.validate_profile',
            'native.provider_capability'
          ))
        )
      `);
      const migrationPath = path.resolve(
        process.cwd(),
        path.basename(process.cwd()) === "api"
          ? "migrations/0101_engineering_execution_request_compatibility.sql"
          : "apps/api/migrations/0101_engineering_execution_request_compatibility.sql",
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

    it("adds the governed Engineering tool without removing existing rows or tool names", async () => {
      const existingId = crypto.randomUUID();
      await database.pool.query(
        "INSERT INTO execution_requests(id,tool_name) VALUES ($1,'workspace.read_file')",
        [existingId],
      );

      await database.pool.query(migrationSql);
      await database.pool.query(migrationSql);

      await expect(
        database.pool.query(
          "INSERT INTO execution_requests(id,tool_name) VALUES ($1,'engineering.repository_capability')",
          [crypto.randomUUID()],
        ),
      ).resolves.toBeDefined();
      await expect(
        database.pool.query(
          "INSERT INTO execution_requests(id,tool_name) VALUES ($1,'arbitrary.execute')",
          [crypto.randomUUID()],
        ),
      ).rejects.toMatchObject({ constraint: "execution_requests_tool_name_check" });
      const result = await database.pool.query<{ tool_name: string }>(
        "SELECT tool_name FROM execution_requests WHERE id=$1",
        [existingId],
      );
      expect(result.rows[0]?.tool_name).toBe("workspace.read_file");
    });
  },
);
