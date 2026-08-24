import {
  AgentConfigurationRecordSchema,
  AgentManifestRecordSchema,
  AgentOsDashboardResponseSchema,
  AgentOsHealthRecordSchema,
  AgentOsMetricsRecordSchema,
  AgentPackageRecordSchema,
  AgentSessionRecordSchema,
  AgentVersionRecordSchema,
  ContextPackageRecordSchema,
  CreateAgentSessionRequestSchema,
  KnowledgeSourceRecordSchema,
  PermissionProfileRecordSchema,
  RuntimeEventRecordSchema,
  ToolRegistryRecordSchema,
  type AgentManifestRecord,
  type AgentRecord,
  type RuntimeConfiguration,
  type RuntimeEventRecord,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { MemoryStore } from "../memory/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { AgentStore } from "./store.js";
import type { AgentOsStore } from "./os-store.js";

const DEFAULT_PERMISSION_PROFILE_ID = "existing_agent_permissions";
const DEFAULT_TOOL_IDS = [
  "repository_intelligence",
  "semantic_code_intelligence",
  "workflow_context",
  "memory_retrieval",
  "policy_review",
] as const;
const DEFAULT_KNOWLEDGE_SOURCE_IDS = [
  "repository",
  "architecture",
  "knowledge_graph",
  "documentation",
  "memory",
  "user_preferences",
  "project_history",
  "design_decisions",
  "previous_workflows",
] as const;

const integrityHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuidFromHash = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${
    variant
  }${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
};

const normalizeCapabilityRef = (capability: string) =>
  capability
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "general";

const runtimeDefaults = (): RuntimeConfiguration => ({
  defaultModel: "governed-default",
  fallbackModel: null,
  temperature: 0.2,
  contextLimitTokens: 64_000,
  executionTimeoutSeconds: 300,
  retryPolicy: { maxRetries: 1, backoff: "exponential" },
  memoryLimitItems: 20,
  reflectionEnabled: true,
  planningDepth: 4,
  parallelism: 1,
  toolPreferences: [...DEFAULT_TOOL_IDS],
  loggingLevel: "info",
  debugMode: false,
});

const agentOsStatusFor = (agent: AgentRecord): AgentManifestRecord["status"] => {
  if (agent.status === "disabled") return "archived";
  if (agent.status === "unhealthy") return "failed";
  if (agent.status === "busy") return "running";
  if (agent.status === "paused") return "waiting";
  return "idle";
};

export class AgentOsService {
  constructor(
    readonly store: AgentOsStore,
    readonly agentStore: AgentStore,
    readonly repositoryStore: RepositoryStore,
    readonly memoryStore: MemoryStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly ensureAgents: (
      ownerId: string,
      requestId?: string,
    ) => Promise<void> = () => Promise.resolve(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return AgentOsDashboardResponseSchema.parse({
      manifests: await this.store.listManifests(ownerId),
      packages: await this.store.listPackages(ownerId, 100),
      sessions: await this.store.listSessions(ownerId, 100),
      events: await this.store.listEvents(ownerId, 100),
      configurations: await this.store.listConfigurations(ownerId, 100),
      tools: await this.store.listTools(ownerId),
      permissionProfiles: await this.store.listPermissionProfiles(ownerId),
      knowledgeSources: await this.store.listKnowledgeSources(ownerId),
      health: await this.store.listHealth(ownerId),
      metrics: await this.store.listMetrics(ownerId),
      versions: await this.store.listVersions(ownerId, 100),
      contextPackages: await this.store.listContextPackages(ownerId, 100),
      runtimeIsolation: true,
      advisoryOnly: true,
    });
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    await this.ensureAgents(ownerId, requestId);
    const at = this.now().toISOString();
    await this.ensurePermissionProfile(ownerId, at);
    await this.ensureTools(ownerId, at);
    await this.ensureKnowledgeSources(ownerId, at);

    for (const agent of await this.agentStore.listAgents(ownerId)) {
      const manifest = this.manifestFor(agent, at);
      const existing = await this.store.findManifest(ownerId, manifest.id);
      await this.store.saveManifest(
        existing ? { ...manifest, createdAt: existing.createdAt } : manifest,
      );
      await this.store.saveConfiguration(
        AgentConfigurationRecordSchema.parse({
          id: uuidFromHash(`agent-os-configuration:${ownerId}:${agent.id}`),
          ownerId,
          agentId: agent.id,
          configuration: manifest.runtimeConfiguration,
          signedChangeRequired: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
      await this.store.savePackage(this.packageFor(manifest, agent, at));
      await this.store.saveHealth(this.healthFor(ownerId, agent, at));
      await this.store.saveMetrics(await this.metricsFor(ownerId, agent.id, at));
      if (!existing) {
        await this.store.saveVersion(
          AgentVersionRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            agentId: agent.id,
            version: manifest.version,
            changeType: "manifest",
            summary: `${agent.displayName} registered with Agent OS manifest source of truth.`,
            rollbackAvailable: true,
            createdAt: at,
          }),
        );
        await this.recordEvent({
          ownerId,
          agentId: agent.id,
          eventType: "AgentCreated",
          summary: `${agent.displayName} Agent OS manifest created.`,
          requestId,
        });
      }
    }
  }

  async startSession(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = CreateAgentSessionRequestSchema.parse(input.body);
    const manifest = await this.store.findManifest(input.ownerId, parsed.agentId);
    if (!manifest) {
      throw new ExecutionError(
        404,
        "AGENT_MANIFEST_NOT_FOUND",
        "Agent manifest not found.",
      );
    }
    if (manifest.status === "archived" || manifest.status === "failed") {
      throw new ExecutionError(
        403,
        "AGENT_RUNTIME_UNAVAILABLE",
        "The requested agent runtime is not available.",
      );
    }

    const at = this.now().toISOString();
    const contextPackage = await this.buildContextPackage({
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      capabilityRefs: manifest.capabilityRefs,
      knowledgeSourceRefs: manifest.knowledgeSourceRefs,
      at,
    });
    const session = AgentSessionRecordSchema.parse({
      id: uuidFromHash(
        `agent-os-package:${manifest.ownerId}:${manifest.id}:${manifest.version}`,
      ),
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      status: "running",
      inputSummary: parsed.inputSummary,
      outputSummary: null,
      toolCallCount: 0,
      messageCount: 0,
      errorCode: null,
      reasoningStatistics: {
        steps: 0,
        confidence: 0,
        memoryRetrievalCount: contextPackage.memoryRefs.length,
        knowledgeRetrievalCount: contextPackage.knowledgeSourceRefs.length,
      },
      startedAt: at,
      endedAt: null,
    });
    await this.store.saveContextPackage(contextPackage);
    await this.store.saveSession(session);
    await this.store.saveManifest({ ...manifest, status: "running", updatedAt: at });
    await this.recordEvent({
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      sessionId: session.id,
      workflowId: session.workflowId,
      eventType: "ContextPackaged",
      summary: "Agent OS context package built from scoped knowledge sources.",
      metadata: {
        contextPackageId: contextPackage.id,
        repositoryCount: contextPackage.repositoryRefs.length,
        memoryCount: contextPackage.memoryRefs.length,
      },
      requestId: input.requestId,
    });
    await this.recordEvent({
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      sessionId: session.id,
      workflowId: session.workflowId,
      eventType: "AgentStarted",
      summary: "Agent OS session started. Runtime remains advisory and approval-gated.",
      requestId: input.requestId,
    });
    await this.audit({
      eventType: "AGENT_SESSION_STARTED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent OS session started.",
      requestId: input.requestId,
      metadata: { agentId: parsed.agentId, sessionId: session.id },
    });
    return { session };
  }

  async startIsolatedDelegation(input: {
    ownerId: string;
    managerAgentId: string;
    specialistAgentId: string;
    delegationId: string;
    task: string;
    contextSummary: string;
    memoryRefs: string[];
    memoryScopes: string[];
    capabilityRefs: string[];
    skillRefs: string[];
    knowledgeSourceRefs: string[];
    contextTokenBudget: number;
    sandboxProfileId: string;
    requestId: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const [manager, specialist] = await Promise.all([
      this.store.findManifest(input.ownerId, input.managerAgentId),
      this.store.findManifest(input.ownerId, input.specialistAgentId),
    ]);
    if (!manager || !specialist) {
      throw new ExecutionError(
        404,
        "AGENT_MANIFEST_NOT_FOUND",
        "Delegation agent manifest was not found.",
      );
    }
    if (specialist.status === "archived" || specialist.status === "failed") {
      throw new ExecutionError(
        403,
        "AGENT_RUNTIME_UNAVAILABLE",
        "The specialist runtime is not available.",
      );
    }
    if (
      input.capabilityRefs.some(
        (capability) => !specialist.capabilityRefs.includes(capability),
      ) ||
      input.knowledgeSourceRefs.some(
        (source) => !specialist.knowledgeSourceRefs.includes(source),
      )
    ) {
      throw new ExecutionError(
        403,
        "DELEGATION_SCOPE_INVALID",
        "Delegation scope exceeds the specialist manifest.",
      );
    }
    for (const memoryId of input.memoryRefs) {
      if (!(await this.memoryStore.findMemory(input.ownerId, memoryId))) {
        throw new ExecutionError(
          403,
          "DELEGATION_MEMORY_INVALID",
          "Delegation memory is unavailable to this owner.",
        );
      }
    }
    const at = this.now().toISOString();
    const contextPackage = ContextPackageRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: specialist.id,
      workflowId: null,
      repositoryRefs: [],
      memoryRefs: input.memoryRefs,
      decisionRefs: [],
      knowledgeSourceRefs: input.knowledgeSourceRefs,
      capabilityRefs: input.capabilityRefs,
      summary: input.contextSummary,
      createdAt: at,
    });
    const session = AgentSessionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: specialist.id,
      workflowId: null,
      status: "running",
      inputSummary: input.task,
      outputSummary: null,
      toolCallCount: 0,
      messageCount: 1,
      errorCode: null,
      delegation: {
        delegationId: input.delegationId,
        managerAgentId: manager.id,
        memoryScopes: input.memoryScopes,
        capabilityRefs: input.capabilityRefs,
        skillRefs: input.skillRefs,
        contextTokenBudget: input.contextTokenBudget,
        sandboxProfileId: input.sandboxProfileId,
        aiRequestId: null,
        providerId: null,
        modelId: null,
        sandboxStatus: "PENDING",
        artifactCount: 0,
        resultConfidence: null,
      },
      reasoningStatistics: {
        steps: 0,
        confidence: 0,
        memoryRetrievalCount: input.memoryRefs.length,
        knowledgeRetrievalCount: input.knowledgeSourceRefs.length,
      },
      startedAt: at,
      endedAt: null,
    });
    await this.store.saveContextPackage(contextPackage);
    await this.store.saveSession(session);
    await this.store.saveManifest({ ...specialist, status: "running", updatedAt: at });
    await this.recordEvent({
      ownerId: input.ownerId,
      agentId: specialist.id,
      sessionId: session.id,
      eventType: "DelegationStarted",
      summary: "Bounded isolated specialist delegation started.",
      metadata: {
        delegationId: input.delegationId,
        managerAgentId: manager.id,
        contextPackageId: contextPackage.id,
        memoryCount: input.memoryRefs.length,
        capabilityCount: input.capabilityRefs.length,
        parentTranscriptIncluded: false,
      },
      requestId: input.requestId,
    });
    return { session, contextPackage, specialist };
  }

  async completeIsolatedDelegation(input: {
    ownerId: string;
    sessionId: string;
    outputSummary: string;
    confidence: number;
    aiRequestId: string;
    providerId: string;
    modelId: string;
    artifactCount: number;
    sandboxStatus: "PASSED" | "FAILED" | "UNAVAILABLE";
    errorCode: string | null;
    requestId: string;
  }) {
    const session = await this.store.findSession(input.ownerId, input.sessionId);
    if (!session?.delegation || session.status !== "running") {
      throw new ExecutionError(
        409,
        "DELEGATION_SESSION_NOT_RUNNING",
        "Delegation session is not running.",
      );
    }
    const at = this.now().toISOString();
    const completed = AgentSessionRecordSchema.parse({
      ...session,
      status: input.errorCode ? "failed" : "completed",
      outputSummary: input.outputSummary,
      errorCode: input.errorCode,
      messageCount: 2,
      delegation: {
        ...session.delegation,
        aiRequestId: input.aiRequestId,
        providerId: input.providerId,
        modelId: input.modelId,
        sandboxStatus: input.sandboxStatus,
        artifactCount: input.artifactCount,
        resultConfidence: input.confidence,
      },
      reasoningStatistics: {
        ...session.reasoningStatistics,
        steps: 1,
        confidence: input.confidence,
      },
      endedAt: at,
    });
    await this.store.saveSession(completed);
    const manifest = await this.store.findManifest(input.ownerId, session.agentId);
    if (manifest) {
      await this.store.saveManifest({ ...manifest, status: "idle", updatedAt: at });
    }
    await this.recordEvent({
      ownerId: input.ownerId,
      agentId: session.agentId,
      sessionId: session.id,
      eventType: input.errorCode ? "DelegationFailed" : "DelegationCompleted",
      summary: input.errorCode
        ? "Isolated specialist delegation failed closed."
        : "Isolated specialist delegation completed with a structured result.",
      metadata: {
        delegationId: session.delegation.delegationId,
        providerId: input.providerId,
        modelId: input.modelId,
        sandboxStatus: input.sandboxStatus,
        artifactCount: input.artifactCount,
      },
      requestId: input.requestId,
    });
    return completed;
  }

  async listManifests(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listManifests(ownerId);
  }

  async listPackages(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listPackages(ownerId, limit);
  }

  async listSessions(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listSessions(ownerId, limit);
  }

  async listEvents(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listEvents(ownerId, limit);
  }

  async listConfigurations(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listConfigurations(ownerId, limit);
  }

  async listTools(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listTools(ownerId);
  }

  async listPermissionProfiles(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listPermissionProfiles(ownerId);
  }

  async listKnowledgeSources(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listKnowledgeSources(ownerId);
  }

  async listHealth(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listHealth(ownerId);
  }

  async listMetrics(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listMetrics(ownerId);
  }

  async listVersions(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listVersions(ownerId, limit);
  }

  async listContextPackages(ownerId: string, limit = 100) {
    await this.ensureBaseline(ownerId);
    return this.store.listContextPackages(ownerId, limit);
  }

  private manifestFor(agent: AgentRecord, at: string) {
    const capabilityRefs = [...new Set(agent.capabilities.map(normalizeCapabilityRef))];
    return AgentManifestRecordSchema.parse({
      id: agent.id,
      ownerId: agent.ownerId,
      name: agent.id,
      displayName: agent.displayName,
      description: agent.healthSummary,
      agentType: agent.configuration.dynamic === true ? "dynamic" : "permanent",
      templateSource:
        typeof agent.configuration.templateId === "string"
          ? agent.configuration.templateId
          : null,
      version: agent.version,
      status: agentOsStatusFor(agent),
      runtimeConfiguration: runtimeDefaults(),
      memoryConfiguration: {
        enabled: true,
        maxRetrievedItems: 12,
        writable: false,
        allowedTypes: ["semantic", "repository", "agent", "preference"],
      },
      capabilityRefs,
      toolRefs: [...DEFAULT_TOOL_IDS],
      permissionProfileId: DEFAULT_PERMISSION_PROFILE_ID,
      knowledgeSourceRefs: [...DEFAULT_KNOWLEDGE_SOURCE_IDS],
      workflowRoles: agent.supportedTasks.slice(0, 50),
      evaluationStrategy:
        "Evaluate outputs using evidence coverage, policy compliance, review outcomes, and validation results. Advisory only.",
      lifecycleRules: [
        "Runtime state is persisted for every session.",
        "Permission changes are made through permission profiles, never ad hoc agent fields.",
        "Tools are referenced through the Tool Registry and remain approval-gated.",
        "Dynamic and permanent agents use the same manifest and runtime model.",
        "No Agent OS runtime may bypass human approval, policy, audit, or emergency stop.",
      ],
      createdAt: agent.createdAt,
      updatedAt: at,
    });
  }

  private packageFor(manifest: AgentManifestRecord, agent: AgentRecord, at: string) {
    const packageRecord = {
      id: crypto.randomUUID(),
      ownerId: manifest.ownerId,
      agentId: manifest.id,
      manifest,
      prompt: `${agent.displayName}: ${agent.healthSummary}\n\nResponsibilities: ${agent.supportedTasks.join(", ")}\n\nConstraints: advisory-only runtime; no permission escalation; no approval bypass.`,
      memorySchemaVersion: "agent-os-memory-v1",
      packageVersion: manifest.version,
      integrityHash: "0".repeat(64),
      exportable: true,
      createdAt: at,
    };
    return AgentPackageRecordSchema.parse({
      ...packageRecord,
      integrityHash: integrityHash({ ...packageRecord, integrityHash: undefined }),
    });
  }

  private async buildContextPackage(input: {
    ownerId: string;
    agentId: string;
    workflowId: string | null;
    capabilityRefs: string[];
    knowledgeSourceRefs: string[];
    at: string;
  }) {
    const repositories = await this.repositoryStore.listRepositories(input.ownerId);
    const memories = await this.memoryStore.searchMemories(input.ownerId, {
      q: input.agentId.replace(/_/g, " "),
      limit: 12,
    });
    const decisions = await this.memoryStore.listDecisions(input.ownerId, 20);
    return ContextPackageRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: input.agentId,
      workflowId: input.workflowId,
      repositoryRefs: repositories.map((repository) => repository.id).slice(0, 100),
      memoryRefs: memories.map((memory) => memory.id).slice(0, 100),
      decisionRefs: decisions.map((decision) => decision.id).slice(0, 100),
      knowledgeSourceRefs: input.knowledgeSourceRefs,
      capabilityRefs: input.capabilityRefs,
      summary:
        "Bounded Agent OS context package assembled from registered repositories, owner-scoped memory, engineering decisions, and declared knowledge sources.",
      createdAt: input.at,
    });
  }

  private async ensurePermissionProfile(ownerId: string, at: string) {
    await this.store.savePermissionProfile(
      PermissionProfileRecordSchema.parse({
        id: DEFAULT_PERMISSION_PROFILE_ID,
        ownerId,
        name: "Existing agent permission boundary",
        repositoryAccess: "registered_read_only",
        filesystemAccess: "registered_read_only",
        memoryAccess: "owner_scoped_read",
        workflowAccess: "assigned",
        apiAccess: "owner_authenticated_read",
        externalServices: "approved_integrations_only",
        toolPermissions: [...DEFAULT_TOOL_IDS],
        deploymentPermissions: "none",
        createdAt: at,
        updatedAt: at,
      }),
    );
  }

  private async ensureTools(ownerId: string, at: string) {
    const tools = [
      {
        id: "repository_intelligence",
        name: "Repository Intelligence",
        description: "Reads indexed repository metadata and repository generations.",
        inputs: ["repositoryId", "generation"],
        outputs: ["files", "directories", "repositoryInsights"],
      },
      {
        id: "semantic_code_intelligence",
        name: "Semantic Code Intelligence",
        description: "Reads semantic symbols, references, dependencies, and graphs.",
        inputs: ["repositoryId", "symbol", "query"],
        outputs: ["symbols", "references", "dependencyGraph"],
      },
      {
        id: "workflow_context",
        name: "Workflow Context",
        description: "Reads workflow state, checkpoints, and validation summaries.",
        inputs: ["workflowId"],
        outputs: ["workflow", "tasks", "validationState"],
      },
      {
        id: "memory_retrieval",
        name: "Memory Retrieval",
        description: "Reads owner-scoped cognitive memory and engineering decisions.",
        inputs: ["query", "repositoryId", "agentId"],
        outputs: ["memories", "decisions", "knowledgeRefs"],
      },
      {
        id: "policy_review",
        name: "Policy Review",
        description:
          "Reads policy posture and approval requirements without changing state.",
        inputs: ["actionDigest", "riskContext"],
        outputs: ["policySummary", "approvalRequirements"],
      },
    ];
    for (const tool of tools) {
      await this.store.saveTool(
        ToolRegistryRecordSchema.parse({
          ...tool,
          ownerId,
          authentication: "owner_session",
          permissions: ["owner_authenticated_read", "policy_controlled"],
          executionPolicy: "advisory_only",
          rateLimit: "owner scoped platform limits",
          availability: "available",
          version: "1.0.0",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private async ensureKnowledgeSources(ownerId: string, at: string) {
    const names = {
      repository: "Repository",
      architecture: "Architecture",
      knowledge_graph: "Knowledge Graph",
      documentation: "Documentation",
      memory: "Cognitive Memory",
      user_preferences: "User Preferences",
      project_history: "Project History",
      design_decisions: "Design Decisions",
      previous_workflows: "Previous Workflows",
    } as const;
    for (const id of DEFAULT_KNOWLEDGE_SOURCE_IDS) {
      await this.store.saveKnowledgeSource(
        KnowledgeSourceRecordSchema.parse({
          id,
          ownerId,
          name: names[id],
          sourceType: id,
          mountPolicy: id === "user_preferences" ? "on_demand" : "always",
          version: "1.0.0",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private healthFor(ownerId: string, agent: AgentRecord, at: string) {
    const availability =
      agent.status === "disabled"
        ? "archived"
        : agent.status === "unhealthy"
          ? "degraded"
          : "available";
    return AgentOsHealthRecordSchema.parse({
      ownerId,
      agentId: agent.id,
      availability,
      latencyMs: 0,
      memoryUsageEstimate: 0,
      failureRate: agent.status === "unhealthy" ? 1 : 0,
      recoveryRate: 1,
      successRate: agent.status === "unhealthy" ? 0 : 1,
      toolReliability: 1,
      checkedAt: at,
    });
  }

  private async metricsFor(ownerId: string, agentId: string, at: string) {
    const sessions = await this.store.listSessions(ownerId, 500);
    const agentSessions = sessions.filter((session) => session.agentId === agentId);
    const successfulExecutions = agentSessions.filter(
      (session) => session.status === "completed",
    ).length;
    const failedExecutions = agentSessions.filter(
      (session) => session.status === "failed",
    ).length;
    return AgentOsMetricsRecordSchema.parse({
      ownerId,
      agentId,
      executions: agentSessions.length,
      successfulExecutions,
      failedExecutions,
      averageRuntimeMs: 0,
      averageReasoningDepth: 0,
      memoryRetrievalCount: agentSessions.reduce(
        (total, session) => total + session.reasoningStatistics.memoryRetrievalCount,
        0,
      ),
      toolUsageCount: agentSessions.reduce(
        (total, session) => total + session.toolCallCount,
        0,
      ),
      capabilityUsageCount: 0,
      knowledgeRetrievalCount: agentSessions.reduce(
        (total, session) => total + session.reasoningStatistics.knowledgeRetrievalCount,
        0,
      ),
      confidenceTrend: successfulExecutions > 0 ? 0.9 : 0.5,
      recordedAt: at,
    });
  }

  private async recordEvent(input: {
    ownerId: string;
    agentId: string;
    sessionId?: string | null;
    workflowId?: string | null;
    eventType: RuntimeEventRecord["eventType"];
    summary: string;
    metadata?: Record<string, unknown>;
    requestId: string;
  }) {
    const event = RuntimeEventRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: input.agentId,
      sessionId: input.sessionId ?? null,
      workflowId: input.workflowId ?? null,
      eventType: input.eventType,
      summary: input.summary,
      metadata: input.metadata ?? {},
      createdAt: this.now().toISOString(),
    });
    await this.store.saveEvent(event);
    await this.audit({
      eventType: "AGENT_RUNTIME_EVENT_RECORDED",
      ownerId: input.ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason: input.summary,
      requestId: input.requestId,
      metadata: {
        agentId: input.agentId,
        eventType: input.eventType,
        sessionId: input.sessionId ?? null,
      },
    });
  }
}
