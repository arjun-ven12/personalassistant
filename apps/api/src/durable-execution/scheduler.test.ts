/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/require-await */
import {
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
  DurableExecutionSchema,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { DurableExecutionScheduler } from "./scheduler.js";
import type { CrossCompanyExecutionService } from "./service.js";
import { InMemoryDurableExecutionStore } from "./store.js";
import { InMemoryAgentStore } from "../agents/store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";
const at = "2026-09-01T00:00:00.000Z";

const execution = (id: string, companyId = companyA) =>
  DurableExecutionSchema.parse({
    id,
    ownerId,
    companyId,
    serviceRequestId: null,
    objectiveId: null,
    workflowId: null,
    deterministicKey: `benchmark:${id}`,
    durabilityClass: "DURABLE",
    backend: "NATIVE_POSTGRES",
    backendWorkflowId: id,
    status: "QUEUED",
    currentStep: "RUN",
    attempt: 0,
    maxAttempts: 3,
    nextRunAt: null,
    cancellationRequested: false,
    version: 1,
    traceId: id.replaceAll("-", "").slice(0, 32),
    createdAt: at,
    updatedAt: at,
    completedAt: null,
  });

describe("centralized durable scheduler", () => {
  it("allows exactly one winner in a multi-worker race and reclaims after expiry", async () => {
    const store = new InMemoryDurableExecutionStore();
    const item = execution("30000000-0000-4000-8000-000000000001");
    await store.saveExecution(item);

    const raced = await Promise.all(
      ["worker-a", "worker-b", "worker-c"].map((workerId) =>
        store.claimRunnable({
          workerId,
          now: at,
          leaseMs: 1_000,
          limit: 1,
          maxPerCompany: 1,
        }),
      ),
    );
    expect(raced.flat()).toHaveLength(1);
    expect(raced.flat()[0]?.leaseGeneration).toBe(1);

    const reclaimed = await store.claimRunnable({
      workerId: "worker-recovery",
      now: "2026-09-01T00:00:02.000Z",
      leaseMs: 1_000,
      limit: 1,
      maxPerCompany: 1,
    });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.leaseGeneration).toBe(2);
  });

  it("bounds global and per-company concurrency while scheduling one shared loop", async () => {
    const store = new InMemoryDurableExecutionStore();
    for (let index = 0; index < 6; index += 1)
      await store.saveExecution(
        execution(
          `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          index < 4 ? companyA : companyB,
        ),
      );
    const runClaimed = vi.fn(async (item: ReturnType<typeof execution>) => item);
    const scheduler = new DurableExecutionScheduler(
      store,
      { runClaimed } as unknown as CrossCompanyExecutionService,
      "central-worker",
      {
        pollIntervalMs: 1_000,
        leaseMs: 30_000,
        globalConcurrency: 3,
        perCompanyConcurrency: 2,
      },
      () => new Date(at),
    );
    await scheduler.tick();
    const claimed = runClaimed.mock.calls.map((call) => call[0]);
    expect(claimed).toHaveLength(3);
    expect(claimed.filter((item) => item.companyId === companyA)).toHaveLength(2);
    expect(claimed.filter((item) => item.companyId === companyB)).toHaveLength(1);
    expect(scheduler.metrics.claimed).toBe(3);
  });

  it("keeps the synthetic 100-company plane bounded at 119 definitions and 2,000 assignments", async () => {
    const companies = 100;
    const definitions = 119;
    const assignments = companies * 20;
    const activeExecutions = companies * 2;
    const store = new InMemoryDurableExecutionStore();
    const agents = new InMemoryAgentStore();
    const started = performance.now();
    for (let index = 0; index < definitions; index += 1)
      agents.upsertDefinition(
        AgentDefinitionSchema.parse({
          id: `benchmark-specialist-${index}`,
          ownerId,
          canonicalKey: `benchmark-specialist-${index}`,
          name: `Benchmark Specialist ${index}`,
          role: "review",
          description: "Synthetic reusable benchmark specialist.",
          skills: ["benchmark"],
          capabilityRequirements: ["company.artifact.report"],
          dataRequirements: [],
          supportedTasks: ["benchmark"],
          defaultModelPolicy: "LOCAL_FIRST",
          defaultSafetyPolicy: "strict",
          defaultOperatingPolicy: "reviewed",
          executionPlacement: "LOCAL_ONLY",
          evaluationProfile: ["evidence"],
          generalizedReputationPrior: 50,
          generalizedCalibrationPrior: 0.5,
          provenance: "SYSTEM",
          sourcePath: null,
          sourceVersion: null,
          license: null,
          version: "1",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
        }),
      );
    for (let index = 0; index < assignments; index += 1) {
      const companyIndex = Math.floor(index / 20);
      agents.saveAssignment(
        CompanyAgentAssignmentSchema.parse({
          id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          ownerId,
          companyId: `20000000-0000-4000-8000-${String(companyIndex).padStart(12, "0")}`,
          agentDefinitionId: `benchmark-specialist-${index % 20}`,
          organizationId: `50000000-0000-4000-8000-${String(companyIndex).padStart(12, "0")}`,
          departmentId: `60000000-0000-4000-8000-${String(companyIndex * 5 + (index % 5)).padStart(12, "0")}`,
          managerAssignmentId: null,
          managerAgentDefinitionId: null,
          governorAssignmentId: null,
          status: index % 10 === 0 ? "ACTIVE" : "DORMANT",
          memoryScopeId: `assignment:benchmark:${index}`,
          departmentMemoryScopeId: `department:benchmark:${companyIndex}:${index % 5}`,
          organizationMemoryScopeId: `company:benchmark:${companyIndex}`,
          capabilityGrantProfileId: "benchmark-grants",
          economyPolicyId: "benchmark-economy",
          modelPolicyOverride: null,
          localReputation: null,
          localCalibration: null,
          companyInstructions: null,
          isGovernor: false,
          createdAt: at,
          updatedAt: at,
          revokedAt: null,
        }),
      );
    }
    for (let index = 0; index < activeExecutions; index += 1) {
      const company = `20000000-0000-4000-8000-${String(index % companies).padStart(12, "0")}`;
      await store.saveExecution(
        execution(
          `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          company,
        ),
      );
    }
    const claims = await store.claimRunnable({
      workerId: "benchmark-worker",
      now: at,
      leaseMs: 30_000,
      limit: 32,
      maxPerCompany: 2,
    });
    const elapsedMs = performance.now() - started;
    expect({ companies, definitions, assignments }).toEqual({
      companies: 100,
      definitions: 119,
      assignments: 2_000,
    });
    expect(agents.listDefinitions(ownerId)).toHaveLength(119);
    expect(
      Array.from({ length: companies }, (_, index) =>
        agents.listAssignments(
          ownerId,
          `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      ).flat(),
    ).toHaveLength(2_000);
    expect(claims).toHaveLength(32);
    expect(new Set(claims.map((item) => item.id)).size).toBe(32);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
