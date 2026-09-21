import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "./database.js";
import { safeTestDatabaseUrl } from "./test-database.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)(
  "Agent OS delegation-event compatibility migration",
  () => {
    let administrationDatabase: PostgresDatabase;
    let database: PostgresDatabase;
    let testSchema: string;
    let migrationSql: string;

    beforeAll(async () => {
      administrationDatabase = new PostgresDatabase(connectionString!);
      testSchema = `agent_os_delegation_${crypto.randomUUID().replaceAll("-", "")}`;
      await administrationDatabase.pool.query(`CREATE SCHEMA "${testSchema}"`);
      const isolatedUrl = new URL(connectionString!);
      isolatedUrl.hostname = isolatedUrl.hostname.replace("-pooler.", ".");
      if (isolatedUrl.searchParams.get("sslmode") !== "disable")
        isolatedUrl.searchParams.set("sslmode", "verify-full");
      isolatedUrl.searchParams.set("options", `-c search_path=${testSchema}`);
      database = new PostgresDatabase(isolatedUrl.toString());
      await database.pool.query(`
        CREATE TABLE agent_runtime_events (
          id uuid PRIMARY KEY,
          event_type text NOT NULL,
          CONSTRAINT agent_runtime_events_event_type_check CHECK (event_type IN (
            'AgentCreated','AgentStarted','AgentPaused','AgentResumed','AgentCompleted',
            'AgentFailed','CapabilityLoaded','ToolInvoked','MemoryUpdated',
            'KnowledgeRetrieved','WorkflowJoined','WorkflowLeft','ContextPackaged',
            'ConfigurationChanged','PackageValidated'
          ))
        )
      `);
      const migrationPath = path.resolve(
        process.cwd(),
        path.basename(process.cwd()) === "api"
          ? "migrations/0102_agent_os_delegation_event_compatibility.sql"
          : "apps/api/migrations/0102_agent_os_delegation_event_compatibility.sql",
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

    it("adds bounded delegation events idempotently without changing existing events", async () => {
      const existingId = crypto.randomUUID();
      await database.pool.query(
        "INSERT INTO agent_runtime_events(id,event_type) VALUES ($1,'AgentStarted')",
        [existingId],
      );

      await database.pool.query(migrationSql);
      await database.pool.query(migrationSql);

      for (const eventType of [
        "DelegationStarted",
        "DelegationCompleted",
        "DelegationFailed",
      ]) {
        await expect(
          database.pool.query(
            "INSERT INTO agent_runtime_events(id,event_type) VALUES ($1,$2)",
            [crypto.randomUUID(), eventType],
          ),
        ).resolves.toBeDefined();
      }
      await expect(
        database.pool.query(
          "INSERT INTO agent_runtime_events(id,event_type) VALUES ($1,'ArbitraryEvent')",
          [crypto.randomUUID()],
        ),
      ).rejects.toMatchObject({
        constraint: "agent_runtime_events_event_type_check",
      });
      const existing = await database.pool.query<{ event_type: string }>(
        "SELECT event_type FROM agent_runtime_events WHERE id=$1",
        [existingId],
      );
      expect(existing.rows[0]?.event_type).toBe("AgentStarted");
    });
  },
);
