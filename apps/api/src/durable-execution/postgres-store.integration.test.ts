import { createHash } from "node:crypto";

import {
  CrossCompanyCollaborationPolicySchema,
  CrossCompanyServiceRequestSchema,
  DurableExecutionEventSchema,
  DurableExecutionSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresDurableExecutionStore } from "./store.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)(
  "Phase 25.6 PostgreSQL durable execution isolation",
  () => {
    let administration: PostgresDatabase;
    let database: PostgresDatabase;
    let store: PostgresDurableExecutionStore;
    let schema: string;
    const ownerId = crypto.randomUUID();
    const otherOwnerId = crypto.randomUUID();
    const nova = crypto.randomUUID();
    const atlas = crypto.randomUUID();
    const otherCompany = crypto.randomUUID();
    const at = "2026-09-01T00:00:00.000Z";

    beforeAll(async () => {
      administration = new PostgresDatabase(connectionString!);
      schema = `phase256_${crypto.randomUUID().replaceAll("-", "")}`;
      await administration.pool.query(`CREATE SCHEMA "${schema}"`);
      const isolated = new URL(connectionString!);
      isolated.hostname = isolated.hostname.replace("-pooler.", ".");
      if (isolated.searchParams.get("sslmode") !== "disable")
        isolated.searchParams.set("sslmode", "verify-full");
      isolated.searchParams.set("options", `-c search_path=${schema}`);
      database = new PostgresDatabase(isolated.toString());
      await database.migrate();
      for (const owner of [ownerId, otherOwnerId]) {
        await database.pool.query(
          "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
          [owner, `phase256-${owner}@example.test`, { id: owner }, at],
        );
      }
      for (const [id, owner, slug, name] of [
        [nova, ownerId, "nova", "Nova"],
        [atlas, ownerId, "atlas", "Atlas"],
        [otherCompany, otherOwnerId, "other", "Other"],
      ] as const) {
        await database.pool.query(
          "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,$3,$4,'ACTIVE','UTC','USD',$5,$6,$6)",
          [
            id,
            owner,
            slug,
            name,
            { id, ownerId: owner, slug, name, status: "ACTIVE" },
            at,
          ],
        );
      }
      store = new PostgresDurableExecutionStore(database.pool);
    }, 60_000);

    afterAll(async () => {
      await database?.close();
      if (administration && schema) {
        await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        await administration.close();
      }
    });

    it("persists reconstructable history and enforces owner/company foreign keys", async () => {
      const policy = CrossCompanyCollaborationPolicySchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: nova,
        allowedDestinationCompanyIds: [atlas],
        allowedServiceTypes: ["BENCHMARK"],
        allowedSharingScopes: ["SUMMARY_ONLY"],
        allowedCapabilities: ["finance.benchmark"],
        maxBudgetCredits: 100,
        approvalThresholdCredits: 50,
        maxConcurrentServices: 5,
        status: "ACTIVE",
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      await store.savePolicy(policy);
      expect(
        await new PostgresDurableExecutionStore(database.pool).findPolicy(
          ownerId,
          nova,
        ),
      ).toEqual(policy);

      const request = CrossCompanyServiceRequestSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        sourceCompanyId: nova,
        destinationCompanyId: atlas,
        requesterAssignmentId: null,
        destinationGovernorAssignmentId: null,
        destinationAssignmentId: null,
        serviceType: "BENCHMARK",
        requestedOutcome: "Review a bounded summary.",
        objectiveId: null,
        workflowId: null,
        requestedCapabilities: ["finance.benchmark"],
        sharedInput: {
          scope: "SUMMARY_ONLY",
          artifactRefs: [],
          metricRefs: [],
          contextRefs: [],
          summary: "Approved summary",
        },
        permittedOutputTypes: ["STRUCTURED_RESULT"],
        confidentiality: "INTERNAL",
        budgetCredits: 10,
        costAttribution: "SOURCE_PAYS",
        actualCostCredits: 0,
        deadline: null,
        priority: "NORMAL",
        status: "ACCEPTED",
        approvalRequirement: "NONE",
        approvalId: null,
        durabilityClass: "CROSS_COMPANY",
        traceId: "0123456789abcdef0123456789abcdef",
        currentStep: "DURABLE_START",
        waitReason: null,
        result: null,
        failureClass: null,
        failureCode: null,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
      });
      await store.saveServiceRequest(request);
      const execution = DurableExecutionSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: atlas,
        serviceRequestId: request.id,
        objectiveId: null,
        workflowId: null,
        deterministicKey: `cross-company:${request.id}`,
        durabilityClass: "CROSS_COMPANY",
        backend: "NATIVE_POSTGRES",
        backendWorkflowId: request.id,
        status: "QUEUED",
        currentStep: "REVALIDATE_POLICY",
        attempt: 0,
        maxAttempts: 3,
        nextRunAt: null,
        cancellationRequested: false,
        version: 1,
        traceId: request.traceId,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
      });
      await store.saveExecution(execution);
      const claimRace = await Promise.all(
        ["postgres-worker-a", "postgres-worker-b", "postgres-worker-c"].map(
          (workerId) =>
            new PostgresDurableExecutionStore(database.pool).claimRunnable({
              workerId,
              now: at,
              leaseMs: 1_000,
              limit: 1,
              maxPerCompany: 1,
            }),
        ),
      );
      expect(claimRace.flat()).toHaveLength(1);
      expect(claimRace.flat()[0]?.leaseGeneration).toBe(1);
      const reclaimed = await store.claimRunnable({
        workerId: "postgres-recovery-worker",
        now: "2026-09-01T00:00:02.000Z",
        leaseMs: 1_000,
        limit: 1,
        maxPerCompany: 1,
      });
      expect(reclaimed).toHaveLength(1);
      expect(reclaimed[0]?.leaseGeneration).toBe(2);
      await store.releaseLease(ownerId, execution.id, "postgres-recovery-worker");
      const event = DurableExecutionEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: atlas,
        executionId: execution.id,
        sequence: 1,
        eventType: "WORKFLOW_STARTED",
        step: "REVALIDATE_POLICY",
        summary: "Durable history started.",
        metadata: {},
        createdAt: at,
      });
      await store.appendEvent(event);
      expect(
        await new PostgresDurableExecutionStore(database.pool).listEvents(
          ownerId,
          execution.id,
        ),
      ).toEqual([event]);
      expect(await store.findExecution(otherOwnerId, execution.id)).toBeUndefined();
      await expect(
        database.pool.query(
          "INSERT INTO durable_workflow_events(id,owner_id,company_id,execution_id,sequence,event_type,record,created_at) VALUES($1,$2,$3,$4,2,'INVALID',$5,$6)",
          [crypto.randomUUID(), otherOwnerId, otherCompany, execution.id, {}, at],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });

    it("benchmarks bounded multi-company PostgreSQL claims without duplicates", async () => {
      const companyIds = Array.from(
        { length: 100 },
        (_, index) => `21000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      );
      const memoryBefore = process.memoryUsage().rss;
      const cpuBefore = process.cpuUsage();
      const started = performance.now();
      await Promise.all(
        companyIds.map((id, index) =>
          database.pool.query(
            "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,$3,$4,'ACTIVE','UTC','USD',$5,$6,$6)",
            [
              id,
              ownerId,
              `benchmark-${index}`,
              `Benchmark ${index}`,
              { id, ownerId, status: "ACTIVE" },
              at,
            ],
          ),
        ),
      );
      await Promise.all(
        companyIds.flatMap((companyId, companyIndex) =>
          Array.from({ length: 2 }, (_, slot) => {
            const index = companyIndex * 2 + slot;
            return store.saveExecution(
              DurableExecutionSchema.parse({
                id: `31000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
                ownerId,
                companyId,
                serviceRequestId: null,
                objectiveId: null,
                workflowId: null,
                deterministicKey: `postgres-benchmark:${index}`,
                durabilityClass: "DURABLE",
                backend: "NATIVE_POSTGRES",
                backendWorkflowId: `postgres-benchmark:${index}`,
                status: "QUEUED",
                currentStep: "RUN",
                attempt: 0,
                maxAttempts: 3,
                nextRunAt: null,
                cancellationRequested: false,
                version: 1,
                traceId: createHash("sha256")
                  .update(`postgres-benchmark:${index}`)
                  .digest("hex")
                  .slice(0, 32),
                createdAt: at,
                updatedAt: at,
                completedAt: null,
              }),
            );
          }),
        ),
      );
      const claimStarted = performance.now();
      const batches: ReturnType<typeof DurableExecutionSchema.parse>[][] = [];
      for (let round = 0; round < 4; round += 1)
        batches.push(
          ...(await Promise.all(
            Array.from({ length: 8 }, (_, worker) =>
              new PostgresDurableExecutionStore(database.pool).claimRunnable({
                workerId: `benchmark-worker-${round}-${worker}`,
                now: at,
                leaseMs: 30_000,
                limit: 8,
                maxPerCompany: 2,
              }),
            ),
          )),
        );
      const claimLatencyMs = performance.now() - claimStarted;
      const claimed = batches
        .flat()
        .filter((item) => item.deterministicKey.startsWith("postgres-benchmark:"));
      const duplicateClaims =
        claimed.length - new Set(claimed.map((item) => item.id)).size;
      const cpu = process.cpuUsage(cpuBefore);
      const elapsedMs = performance.now() - started;
      const measurements = {
        companies: companyIds.length,
        runnableExecutions: 200,
        claimed: claimed.length,
        duplicateClaims,
        claimLatencyMs: Math.round(claimLatencyMs * 100) / 100,
        averageClaimQueryMs: Math.round((claimLatencyMs / batches.length) * 100) / 100,
        throughputClaimsPerSecond:
          Math.round((claimed.length / (claimLatencyMs / 1_000)) * 100) / 100,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        rssDeltaBytes: process.memoryUsage().rss - memoryBefore,
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
        failedClaims: batches.filter((batch) => batch.length === 0).length,
      };
      process.stdout.write(
        `PHASE_25_6_POSTGRES_BENCHMARK ${JSON.stringify(measurements)}\n`,
      );
      expect(claimed.length).toBeGreaterThanOrEqual(64);
      expect(duplicateClaims).toBe(0);
      expect(elapsedMs).toBeLessThan(30_000);
    }, 60_000);
  },
);
