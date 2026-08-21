import { describe, expect, it } from "vitest";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryApplicationIntelligenceStore } from "../application-intelligence/store.js";
import { InMemoryHumanUnderstandingStore } from "../human-understanding/store.js";
import { InMemoryKnowledgeGraphStore } from "../knowledge-graph/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { InMemoryWorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import { CognitiveContextService } from "./context/service.js";
import { registerProductionContextSources } from "./context/sources.js";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workflowId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const conversationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const entityId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const at = "2026-08-14T04:00:00.000Z";

const productionFixture = () => {
  const memoryStore = new InMemoryMemoryStore();
  const knowledgeGraphStore = new InMemoryKnowledgeGraphStore();
  const learningEngineStore = new InMemoryLearningEngineStore();
  const humanUnderstandingStore = new InMemoryHumanUnderstandingStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const workflowStore = new InMemoryWorkflowStore();
  const agentStore = new InMemoryAgentStore();
  const workspaceIntelligenceStore = new InMemoryWorkspaceIntelligenceStore();
  const applicationIntelligenceStore = new InMemoryApplicationIntelligenceStore();
  const service = new CognitiveContextService();
  registerProductionContextSources(service, {
    memoryStore,
    knowledgeGraphStore,
    learningEngineStore,
    humanUnderstandingStore,
    repositoryStore,
    workflowStore,
    agentStore,
    workspaceIntelligenceStore,
    applicationIntelligenceStore,
  });
  return {
    service,
    memoryStore,
    knowledgeGraphStore,
    learningEngineStore,
    humanUnderstandingStore,
    repositoryStore,
    workflowStore,
    agentStore,
    workspaceIntelligenceStore,
  };
};

describe("Phase 20R-C production cognitive sources", () => {
  it("retrieves seeded owner-scoped personality, memory, graph, preference, conversation, project, workflow, and agent records", async () => {
    const stores = productionFixture();
    stores.humanUnderstandingStore.saveProfile({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      name: "Owner profile",
      identity: "Product builder",
      speechStyle: "Direct",
      communicationStyle: "Concise",
      workingStyle: "Evidence first",
      decisionStyle: "Risk aware",
      socialRules: [],
      interactionPolicies: [],
      active: true,
      version: 3,
      createdAt: at,
      updatedAt: at,
    });
    stores.memoryStore.saveMemory({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: ownerA,
      repositoryId: projectId,
      agentId: "coding-agent",
      workflowId,
      memoryType: "preference",
      source: "owner",
      title: "Preferred editor",
      summary: "VS Code",
      content: "Use VS Code for Phase 20R work.",
      tags: ["phase-20r", "editor"],
      importance: 90,
      confidence: 0.98,
      evidence: [],
      version: 2,
      createdAt: at,
      updatedAt: at,
      lastAccessedAt: null,
      expiresAt: null,
    });
    stores.memoryStore.saveMemory({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: ownerB,
      repositoryId: projectId,
      agentId: "coding-agent",
      workflowId,
      memoryType: "semantic",
      source: "owner",
      title: "Quant secret",
      summary: "MUST NOT LEAK",
      content: "MUST NOT LEAK",
      tags: ["phase-20r"],
      importance: 100,
      confidence: 1,
      evidence: [],
      version: 1,
      createdAt: at,
      updatedAt: at,
      lastAccessedAt: null,
      expiresAt: null,
    });
    stores.knowledgeGraphStore.saveEntity({
      id: entityId,
      ownerId: ownerA,
      entityType: "PROJECT",
      canonicalName: "Phase 20R",
      normalizedName: "phase 20r",
      displayName: "Phase 20R",
      description: "Cognitive context remediation",
      status: "active",
      confidence: 0.99,
      sourceType: "manual",
      sourceId: null,
      sourceUri: null,
      firstObservedAt: at,
      lastObservedAt: at,
      metadata: { projectId },
      tags: ["context"],
      aliases: ["20R"],
      externalIdentifiers: {},
      embeddingReference: null,
      isArchived: false,
      isPinned: true,
      provenance: [],
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    stores.knowledgeGraphStore.saveFact({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      subjectEntityId: entityId,
      predicate: "preferred editor",
      valueType: "string",
      value: "VS Code",
      confidence: 0.99,
      sourceType: "manual",
      sourceId: null,
      validFrom: null,
      validUntil: null,
      firstObservedAt: at,
      lastObservedAt: at,
      ownerConfirmed: true,
      provenance: [],
      isArchived: false,
      createdAt: at,
      updatedAt: at,
    });
    stores.learningEngineStore.savePreference({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      category: "TOOL_PREFERENCE",
      subject: "Preferred editor",
      value: "VS Code",
      context: {
        level: "PROJECT",
        projectId,
        applicationId: null,
        workflowId,
        agentId: "coding-agent",
        profileId: null,
        modality: null,
        timeBucket: null,
        weekdayBucket: null,
      },
      confidence: 0.9,
      sourceCandidateId: null,
      effectiveFrom: at,
      effectiveUntil: null,
      locked: false,
      manualOverride: false,
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
      version: 1,
      explanation: "Repeated owner choice.",
    });
    stores.repositoryStore.upsertRepository({
      schemaVersion: "1",
      id: projectId,
      ownerId: ownerA,
      workspaceId: "alexa-workspace",
      indexStatus: "INDEXED",
      activeGeneration: 1,
      activeFingerprint: "a".repeat(64),
      lastIndexedAt: at,
      lastFailureCode: null,
      createdAt: at,
      updatedAt: at,
    });
    stores.workflowStore.create({
      workflow: {
        schemaVersion: "1",
        id: workflowId,
        ownerId: ownerA,
        goal: "Complete Phase 20R context integration",
        repositoryIds: [projectId],
        workspaceIds: ["alexa-workspace"],
        status: "EXECUTING",
        approvalStrategy: "approve_high_risk_only",
        riskLevel: "medium",
        difficulty: "high",
        planSummary: "Wire production cognitive sources.",
        architectureImpact: ["AI router"],
        validationRequirements: ["typecheck", "tests"],
        currentTaskId: taskId,
        createdAt: at,
        updatedAt: at,
        pausedAt: null,
        completedAt: null,
        failureCode: null,
      },
      tasks: [
        {
          id: taskId,
          workflowId,
          title: "Verify context",
          goal: "Prove source integration",
          status: "IN_PROGRESS",
          dependencies: [],
          estimatedComplexity: "high",
          affectedFiles: ["apps/api/src/ai/context/sources.ts"],
          riskLevel: "medium",
          validationPlan: ["tests"],
          rollbackPlan: "Revert the bounded source registration.",
          patchId: null,
          validationRunId: null,
          approvalCheckpointId: null,
          createdAt: at,
          updatedAt: at,
          completedAt: null,
          failureCode: null,
        },
      ],
      checkpoints: [],
      events: [],
    });
    stores.agentStore.upsertAgent({
      schemaVersion: "1",
      id: "coding-agent",
      ownerId: ownerA,
      role: "coding",
      displayName: "Coding Agent",
      version: "1.0.0",
      status: "busy",
      capabilities: ["context.integration"],
      supportedTasks: ["phase.20r"],
      configuration: {},
      createdAt: at,
      updatedAt: at,
      healthSummary: "Healthy",
    });
    stores.agentStore.saveTask({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      agentId: "coding-agent",
      workflowId,
      title: "Context integration",
      objective: "Finish Phase 20R",
      status: "in_progress",
      priority: "high",
      dependencies: [],
      repositoryIds: [projectId],
      evidence: ["production source test"],
      assignedAt: at,
      updatedAt: at,
      completedAt: null,
      resultSummary: null,
    });
    stores.agentStore.saveMessage({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      senderAgentId: "owner-proxy",
      recipientAgentId: "coding-agent",
      conversationId,
      workflowId,
      taskId,
      messageType: "assignment",
      payload: { text: "Continue Phase 20R in VS Code" },
      evidence: [],
      priority: "high",
      createdAt: at,
    });
    stores.workspaceIntelligenceStore.saveContext({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      currentApplicationId: "visual-studio-code",
      currentProviderId: "vscode-provider",
      currentWorkspaceId: "alexa-workspace",
      currentObjectId: null,
      currentRepository: "personalassistant",
      currentFile: "apps/api/src/ai/context/sources.ts",
      currentBrowserTab: null,
      currentSelection: null,
      workingSetObjectIds: [],
      updatedAt: at,
    });

    const context = await stores.service.compose({
      ownerId: ownerA,
      purpose: "OTHER",
      taskText: "Continue Phase 20R with the coding agent in VS Code",
      projectId,
      workflowId,
      taskId,
      agentId: "coding-agent",
      conversationId,
      entityIds: [entityId],
      requestedProfile: "CODING",
      includeSources: [
        "PERSONALITY",
        "MEMORY",
        "KNOWLEDGE_GRAPH",
        "LEARNED_PREFERENCE",
        "CONVERSATION",
        "PROJECT",
        "WORKFLOW",
        "AGENT",
        "RECENT_ACTIVITY",
      ],
      locality: "LOCAL",
      providerTrust: "TRUSTED_LOCAL",
      maxContextTokens: 12_000,
    });

    const types = new Set(context.blocks.map((item) => item.sourceType));
    for (const source of [
      "PERSONALITY",
      "KNOWLEDGE_GRAPH",
      "CONVERSATION",
      "PROJECT",
      "WORKFLOW",
      "AGENT",
      "RECENT_ACTIVITY",
    ] as const)
      expect(types.has(source), `missing ${source}`).toBe(true);
    const provenanceTypes = new Set(context.provenance.map((item) => item.sourceType));
    expect(provenanceTypes.has("MEMORY")).toBe(true);
    expect(provenanceTypes.has("LEARNED_PREFERENCE")).toBe(true);
    expect(JSON.stringify(context.blocks)).not.toContain("MUST NOT LEAK");
    expect(context.profileOrigin).toBe("SYSTEM_PROFILE");
    expect(context.provenance.length).toBeGreaterThanOrEqual(8);
    const editorFact = context.blocks.find((item) =>
      item.sourceReferences?.some((reference) =>
        ["MEMORY", "KNOWLEDGE_GRAPH", "LEARNED_PREFERENCE"].includes(
          reference.sourceType,
        ),
      ),
    );
    expect(
      new Set(editorFact?.sourceReferences?.map((item) => item.sourceType)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      context.omittedCandidates.filter((item) => item.reason === "DUPLICATE"),
    ).toHaveLength(2);
    expect(stores.service.metrics().contextTokens).toBeGreaterThan(0);
    expect(stores.service.metrics().sourceLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
