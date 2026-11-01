import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostgresDatabase } from "../../persistence/database.js";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../../persistence/test-database.js";
import { PostgresAIBenchmarkStore } from "./postgres-store.js";
import { AIBenchmarkRunner } from "./service.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();

describe.skipIf(!connectionString)(
  "Phase 20R-E PostgreSQL benchmark persistence",
  () => {
    let cleanup: (() => Promise<void>) | undefined;
    let database: PostgresDatabase;


    beforeAll(async () => {
      ({ database, cleanup } = await createIsolatedTestDatabase(connectionString!, "phase20re"));
      for (const [id, email] of [
        [ownerA, `benchmark-${ownerA}@example.test`],
        [ownerB, `benchmark-${ownerB}@example.test`],
      ])
        await database.pool.query(
          `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
         VALUES($1,$2,'test-only',$3,NOW(),NOW())
         ON CONFLICT(id) DO NOTHING`,
          [id, email, { id, email }],
        );
    }, 60_000);
    afterAll(async () => {
      await cleanup?.();
    });

    it("persists runs, exact colon model profiles, baselines, results, and owner isolation across runner reconstruction", async () => {
      const executor = () => ({
        output: { intent: "Behaviour.greeting_response" },
        providerId: "ollama",
        modelId: "gemma3:4b",
        locality: "LOCAL" as const,
        latencyMs: 1,
      });
      const first = new AIBenchmarkRunner(
        executor,
        new PostgresAIBenchmarkStore(database.pool),
      );
      const run = await first.runSuite(ownerA, "alexa-core-deterministic", "FAST", {
        maxCases: 1,
        baseline: true,
      });
      expect(run.results).toHaveLength(1);
      const restarted = new AIBenchmarkRunner(
        executor,
        new PostgresAIBenchmarkStore(database.pool),
      );
      const recovered = await restarted.getRun(ownerA, run.id);
      expect(recovered).toMatchObject({ id: run.id, baseline: true, status: "PASS" });
      expect(recovered?.results).toHaveLength(1);
      expect(await restarted.listProfiles(ownerA)).toMatchObject([
        { providerId: "ollama", modelId: "gemma3:4b" },
      ]);
      expect(await restarted.getRun(ownerB, run.id)).toBeUndefined();
      expect(await restarted.listRuns(ownerB)).toEqual([]);
    });
  },
);
