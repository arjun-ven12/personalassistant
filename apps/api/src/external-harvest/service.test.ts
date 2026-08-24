import {
  AIProviderHealthSchema,
  MemoryRecordSchema,
  type AIInferenceRequest,
  type AIModelDescriptor,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { AgentFactoryService } from "../agents/factory.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { EXTERNAL_HARVEST_MANIFEST } from "./manifest.js";
import { ExternalHarvestService } from "./service.js";
import type { AIRouterService } from "../ai/router/service.js";
import { AIRouterService as CanonicalAIRouterService } from "../ai/router/service.js";
import type { AIProvider } from "../ai/provider.js";
import { AIModelRegistry, AIProviderRegistry } from "../ai/registry.js";
import { AIRuntimeService } from "../ai/runtime-service.js";
import type { DockerNodeTestSandbox } from "./docker-sandbox.js";

const delegationModel: AIModelDescriptor = {
  providerId: "bounded-local",
  modelId: "specialist-test",
  displayName: "Bounded specialist test model",
  enabled: true,
  capabilities: {
    textGeneration: true,
    structuredOutput: true,
    reasoning: true,
    toolCalling: false,
    vision: false,
    embeddings: false,
    streaming: false,
  },
  modality: ["TEXT"],
  locality: "LOCAL",
};

const canonicalDelegationRouter = () => {
  const providers = new AIProviderRegistry();
  const provider: AIProvider = {
    providerId: delegationModel.providerId,
    providerType: "LOCAL",
    healthCheck: () =>
      Promise.resolve(
        AIProviderHealthSchema.parse({
          providerId: delegationModel.providerId,
          status: "HEALTHY",
          latencyMs: 1,
          lastCheckedAt: new Date().toISOString(),
          errorCategory: null,
          version: "test",
          modelsVisible: 1,
        }),
      ),
    listModels: () => Promise.resolve([delegationModel]),
    getCapabilities: () => delegationModel.capabilities,
    describe: () => ({
      providerId: delegationModel.providerId,
      displayName: "Bounded local test provider",
      providerType: "LOCAL",
      enabled: true,
      configured: true,
      capabilities: delegationModel.capabilities,
      credentialState: "NOT_REQUIRED",
      baseEndpoint: "local",
    }),
    generate: (request: AIInferenceRequest) =>
      Promise.resolve({
        requestId: request.requestId ?? crypto.randomUUID(),
        providerId: delegationModel.providerId,
        modelId: delegationModel.modelId,
        status: "SUCCESS",
        outputText: "Structured delegation required.",
        latencyMs: 1,
      }),
    generateStructured: (request) =>
      Promise.resolve({
        requestId: request.requestId ?? crypto.randomUUID(),
        providerId: delegationModel.providerId,
        modelId: delegationModel.modelId,
        status: "SUCCESS" as const,
        structuredOutput: request.schema.parse({
          summary: "The specialist returned a bounded review.",
          findings: ["The supplied function needs a focused regression test."],
          proposedTest: null,
          confidence: 0.91,
        }),
        latencyMs: 1,
      }),
  };
  providers.register(provider);
  const models = new AIModelRegistry();
  models.register(delegationModel);
  const runtime = new AIRuntimeService(providers, models);
  runtime.setRole({
    role: "GENERAL_REASONER",
    providerId: delegationModel.providerId,
    modelId: delegationModel.modelId,
    enabled: true,
  });
  return new CanonicalAIRouterService(runtime);
};

const setup = (options?: {
  aiRouter?: AIRouterService;
  sandbox?: DockerNodeTestSandbox;
}) => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const agentOsStore = new InMemoryAgentOsStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const memoryStore = new InMemoryMemoryStore();
  const factory = new AgentFactoryService(agentStore, repositoryStore, audit);
  const registry = new AgentRegistryService(agentStore, audit, undefined, factory);
  const agentOs = new AgentOsService(
    agentOsStore,
    agentStore,
    repositoryStore,
    memoryStore,
    audit,
    undefined,
    (id, requestId) => registry.ensureBuiltIns(id, requestId),
  );
  return {
    ownerId,
    audits,
    memoryStore,
    agentOs,
    service: new ExternalHarvestService(
      agentOs,
      memoryStore,
      audit,
      undefined,
      options?.aiRouter,
      undefined,
      undefined,
      options?.sandbox,
    ),
  };
};

describe("ExternalHarvestService", () => {
  it("publishes pinned provenance without activating external runtimes", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.manifest.projects).toHaveLength(3);
    expect(
      dashboard.manifest.projects.every((project) => !project.externalRuntimeActive),
    ).toBe(true);
    expect(
      dashboard.manifest.artifacts.every(
        (item) =>
          item.provenance.license === "MIT" && item.provenance.commitSha.length === 40,
      ),
    ).toBe(true);
    expect(dashboard.authority).toMatchObject({
      alexaGovernanceAuthoritative: true,
      aiRouterRequired: true,
      alexaMemoryRequired: true,
      externalRuntimesActive: false,
    });
  });

  it("reports missing evidence without fabricating facts or crossing owners", async () => {
    const { audits, memoryStore, ownerId, service } = setup();
    const otherOwnerId = crypto.randomUUID();
    const at = new Date().toISOString();
    memoryStore.saveMemory(
      MemoryRecordSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        repositoryId: null,
        agentId: null,
        workflowId: null,
        memoryType: "semantic",
        source: "owner",
        title: "Acme procurement process",
        summary: "Acme requires security review before procurement.",
        content: "The procurement process requires security review.",
        tags: ["acme", "procurement"],
        importance: 80,
        confidence: 1,
        evidence: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
        lastAccessedAt: null,
        expiresAt: null,
      }),
    );
    memoryStore.saveMemory(
      MemoryRecordSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId: otherOwnerId,
        repositoryId: null,
        agentId: null,
        workflowId: null,
        memoryType: "semantic",
        source: "owner",
        title: "Acme budget",
        summary: "Confidential budget from another owner.",
        content: "The budget is private.",
        tags: ["budget"],
        importance: 80,
        confidence: 1,
        evidence: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
        lastAccessedAt: null,
        expiresAt: null,
      }),
    );

    const result = await service.knowledgeGaps({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        agentId: "planning_agent",
        objective: "Close Acme",
        requiredFacts: ["procurement process", "budget"],
      },
    });

    expect(result.known.map((item) => item.fact)).toEqual(["procurement process"]);
    expect(result.missing).toEqual(["budget"]);
    expect(result.fabricatedFacts).toBe(false);
    expect(audits.map((event) => event.eventType)).toContain("KNOWLEDGE_GAP_ASSESSED");

    const lookup = await service.brainFirstLookup({
      ownerId,
      body: {
        agentId: "planning_agent",
        query: "procurement process",
        minimumEvidence: 1,
      },
    });
    expect(lookup).toMatchObject({
      sufficient: true,
      externalRetrievalRecommended: false,
      externalRetrievalStarted: false,
      fabricatedFacts: false,
    });
  });

  it("prepares isolated delegation by reducing requested authority", async () => {
    const { audits, ownerId, service } = setup();
    const delegation = await service.prepareDelegation({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        managerAgentId: "engineering_manager",
        specialistAgentId: "planning_agent",
        task: "Assess the proposed service boundary.",
        contextSummary: "Only the service contract and two evidence references.",
        requestedMemoryScopes: ["ENGINEERING", "FINANCE"],
        requestedCapabilities: ["architecture_analysis", "unrestricted_shell"],
        requestedSkills: ["vendor_direct_execution"],
        tokenBudget: 90_000,
        costBudgetUsd: 5,
        sandboxProfileId: "registered_validation_readonly",
      },
    });

    expect(delegation.allowedMemoryScopes).toEqual(["ENGINEERING"]);
    expect(delegation.allowedCapabilities).toEqual(["architecture_analysis"]);
    expect(delegation.allowedSkills).toEqual([]);
    expect(delegation.rejectedRequests).toEqual(
      expect.arrayContaining([
        "memory:FINANCE",
        "capability:unrestricted_shell",
        "skill:vendor_direct_execution",
      ]),
    );
    expect(delegation.tokenBudget).toBe(64_000);
    expect(delegation).toMatchObject({
      parentTranscriptIncluded: false,
      directProviderAccess: false,
      canApprove: false,
      executionStarted: false,
      sandbox: {
        hostShellAllowed: false,
        arbitraryCommandsAllowed: false,
        networkAccess: false,
        writableHostFilesystem: false,
      },
    });
    expect(audits.map((event) => event.eventType)).toContain(
      "AGENT_DELEGATION_PREPARED",
    );
  });

  it("executes an isolated specialist through AIRouter and the registered sandbox", async () => {
    const router = {
      executeStructured: (request: { context?: unknown[] }) => {
        expect(JSON.stringify(request.context)).not.toContain("parent transcript");
        return Promise.resolve({
          requestId: requestId,
          outcome: "SUCCESS",
          decision: {},
          attempts: [],
          structuredOutput: {
            summary: "A focused test was proposed and validated.",
            findings: ["The function returns the expected value."],
            proposedTest: {
              filename: "generated.test.cjs",
              content:
                "const test = require('node:test'); const assert = require('node:assert'); const fn = require('./source.cjs'); test('increments', () => assert.equal(fn(1), 2));",
            },
            confidence: 0.93,
          },
          providerId: "test-provider",
          modelId: "test-model",
          latencyMs: 12,
        });
      },
      activity: () => [],
      metrics: () => ({
        total: 1,
        noAI: 0,
        local: 0,
        cloud: 1,
        escalated: 0,
        clarified: 0,
        retries: 0,
        failed: 0,
      }),
    } as unknown as AIRouterService;
    const sandbox = {
      execute: () =>
        Promise.resolve({
          providerId: "docker_node_test_v1",
          status: "PASSED",
          exitCode: 0,
          durationMs: 18,
          stdout: "1 test passed",
          stderr: "",
          network: "disabled",
          hostWrites: false,
          cleanedUp: true,
        }),
    } as unknown as DockerNodeTestSandbox;
    const requestId = crypto.randomUUID();
    const { agentOs, audits, ownerId, service } = setup({
      aiRouter: router,
      sandbox,
    });

    const result = await service.executeDelegation({
      ownerId,
      requestId,
      ipAddress: "127.0.0.1",
      body: {
        managerAgentId: "engineering_manager",
        specialistAgentId: "testing_agent",
        task: "Review this function and write a test.",
        contextSummary: "Only the supplied function and test objective.",
        requestedMemoryScopes: ["ENGINEERING", "FINANCE"],
        requestedCapabilities: ["test_plan", "unrestricted_shell"],
        requestedSkills: [],
        tokenBudget: 8_000,
        costBudgetUsd: 1,
        sandboxProfileId: "registered_validation_readonly",
        developmentInput: {
          sourceCode: "module.exports = (value) => value + 1;",
          testObjective: "Verify the function increments a number.",
        },
      },
    });

    expect(result).toMatchObject({
      status: "COMPLETE",
      tests: { status: "PASSED", network: "disabled", hostWrites: false },
      context: {
        parentTranscriptIncluded: false,
        memoryScopes: ["ENGINEERING"],
        capabilityRefs: ["test_plan"],
      },
      ai: { routedThroughAIRouter: true },
    });
    expect((await agentOs.dashboard(ownerId)).sessions[0]).toMatchObject({
      status: "completed",
      delegation: { sandboxStatus: "PASSED", artifactCount: 1 },
    });
    expect(audits.map((event) => event.eventType)).toContain(
      "AGENT_DELEGATION_EXECUTED",
    );
    expect(audits.map((event) => event.eventType)).toContain("AGENT_SANDBOX_EXECUTED");
  });

  it("uses the canonical AIRouter runtime for isolated specialist inference", async () => {
    const router = canonicalDelegationRouter();
    const { ownerId, service } = setup({ aiRouter: router });

    const result = await service.executeDelegation({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        managerAgentId: "engineering_manager",
        specialistAgentId: "planning_agent",
        task: "Review the bounded service contract.",
        contextSummary: "Only the public interface and acceptance criteria.",
        requestedMemoryScopes: ["ENGINEERING"],
        requestedCapabilities: ["architecture_analysis"],
        requestedSkills: [],
        tokenBudget: 4_000,
        costBudgetUsd: 0,
        sandboxProfileId: "registered_validation_readonly",
      },
    });

    expect(result).toMatchObject({
      status: "COMPLETE",
      ai: {
        providerId: "bounded-local",
        modelId: "specialist-test",
        routedThroughAIRouter: true,
      },
      context: { parentTranscriptIncluded: false },
    });
    expect(router.metrics()).toMatchObject({ total: 1, local: 1, cloud: 0 });
  });

  it("builds the brain summary from live Alexa-owned state", async () => {
    const { ownerId, service } = setup();
    const summary = await service.brainSummary(ownerId);

    expect(summary.nodes.map((node) => node.id)).toEqual([
      "memory",
      "context",
      "agents",
      "skills",
      "workflows",
      "capabilities",
      "ai",
      "knowledge",
    ]);
    expect(
      summary.organization.some((agent) => agent.id === "engineering_manager"),
    ).toBe(true);
    expect(summary.observability).toMatchObject({
      brainFirstLookups: 0,
      memorySufficient: 0,
    });
  });

  it("classifies each harvested artifact exactly once", () => {
    expect(
      new Set(EXTERNAL_HARVEST_MANIFEST.artifacts.map((item) => item.id)).size,
    ).toBe(EXTERNAL_HARVEST_MANIFEST.artifacts.length);
    expect(
      EXTERNAL_HARVEST_MANIFEST.artifacts.every(
        (item) => typeof item.classification === "string",
      ),
    ).toBe(true);
  });
});
