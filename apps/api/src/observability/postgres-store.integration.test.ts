import {
  AIObservabilityTraceSchema,
  SystemTelemetrySpanSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresObservabilityStore } from "./store.js";

const connectionString = safeTestDatabaseUrl();
describe.skipIf(!connectionString)(
  "Phase 25.5 PostgreSQL observability persistence",
  () => {
    let administration: PostgresDatabase;
    let database: PostgresDatabase;
    let store: PostgresObservabilityStore;
    let schema: string;
    const ownerId = crypto.randomUUID(),
      otherOwner = crypto.randomUUID(),
      companyId = crypto.randomUUID();
    const at = "2026-09-01T00:00:00.000Z";
    beforeAll(async () => {
      administration = new PostgresDatabase(connectionString!);
      schema = `phase255_${crypto.randomUUID().replaceAll("-", "")}`;
      await administration.pool.query(`CREATE SCHEMA "${schema}"`);
      const isolated = new URL(connectionString!);
      isolated.hostname = isolated.hostname.replace("-pooler.", ".");
      if (isolated.searchParams.get("sslmode") !== "disable")
        isolated.searchParams.set("sslmode", "verify-full");
      isolated.searchParams.set("options", `-c search_path=${schema}`);
      database = new PostgresDatabase(isolated.toString());
      await database.migrate();
      for (const owner of [ownerId, otherOwner])
        await database.pool.query(
          "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
          [owner, `phase255-${owner}@example.test`, { id: owner }, at],
        );
      await database.pool.query(
        "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'nova','Nova','ACTIVE','UTC','USD',$3,$4,$4)",
        [companyId, ownerId, { id: companyId, ownerId, name: "Nova" }, at],
      );
      store = new PostgresObservabilityStore(database.pool);
    }, 60_000);
    afterAll(async () => {
      await database?.close();
      if (administration && schema) {
        await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        await administration.close();
      }
    });
    it("persists correlated evidence and keeps owner/company indexes isolated", async () => {
      const span = SystemTelemetrySpanSchema.parse({
        id: crypto.randomUUID(),
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        parentSpanId: null,
        ownerId,
        companyId,
        service: "api",
        operation: "objective.workflow",
        status: "ERROR",
        errorSource: "MODEL",
        durationMs: 42,
        objectiveId: null,
        workflowId: null,
        taskId: null,
        assignmentId: null,
        agentDefinitionId: null,
        capabilityId: null,
        provider: "openai",
        model: "gpt-test",
        attributes: { "safe.count": 1 },
        retentionClass: "EXTENDED",
        sampled: true,
        startedAt: at,
        endedAt: "2026-09-01T00:00:00.042Z",
        expiresAt: "2026-12-01T00:00:00.000Z",
      });
      const ai = AIObservabilityTraceSchema.parse({
        id: crypto.randomUUID(),
        traceId: span.traceId,
        ownerId,
        companyId,
        assignmentId: null,
        taskId: null,
        objectiveId: null,
        workflowId: null,
        agentDefinitionId: null,
        provider: "openai",
        model: "gpt-test",
        promptVersion: "v1",
        policyVersion: "strict-v1",
        taskClass: "planning",
        reasoningType: "STRUCTURED",
        locality: "REMOTE",
        latencyMs: 42,
        inputTokens: 100,
        outputTokens: 20,
        costCredits: 2,
        costUsd: "0.002",
        success: false,
        retries: 1,
        reviewOutcome: "FAIL",
        verificationResult: "FAILED",
        evaluationScores: [],
        dataSensitivity: "INTERNAL",
        exportPolicy: "METADATA_ONLY",
        retentionClass: "EXTENDED",
        startedAt: at,
        endedAt: "2026-09-01T00:00:00.042Z",
        expiresAt: "2026-12-01T00:00:00.000Z",
      });
      await store.saveSystemSpan(span);
      await store.saveAITrace(ai);
      expect(
        await store.listSystemSpans(ownerId, {
          companyId,
          traceId: span.traceId,
          limit: 10,
        }),
      ).toEqual([span]);
      expect(await store.listAITraces(ownerId, { companyId, limit: 10 })).toEqual([ai]);
      expect(await store.listSystemSpans(otherOwner, { limit: 10 })).toEqual([]);
      expect(await store.listAITraces(otherOwner, { limit: 10 })).toEqual([]);
    });
  },
);
