import {
  BrainRuntimeSummarySchema,
  BrainFirstLookupRequestSchema,
  BrainFirstLookupResponseSchema,
  DelegationResultSchema,
  ExternalHarvestDashboardSchema,
  ExecuteDelegationRequestSchema,
  KnowledgeGapRequestSchema,
  KnowledgeGapResponseSchema,
  PrepareDelegationRequestSchema,
  PreparedDelegationSchema,
  SpecialistReasoningOutputSchema,
  type OrganizationalMemoryScope,
} from "@alexa-control/shared";

import type { AgentOsService } from "../agents/os-service.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { DesktopSkillStore } from "../desktop-skills/store.js";
import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { MemoryStore } from "../memory/store.js";
import type { WorkflowStore } from "../workflows/store.js";
import { DockerNodeTestSandbox } from "./docker-sandbox.js";
import { EXTERNAL_HARVEST_MANIFEST } from "./manifest.js";

const sourceScope = (sourceType: string): OrganizationalMemoryScope => {
  if (
    ["repository", "architecture", "project_history", "design_decisions"].includes(
      sourceType,
    )
  ) {
    return "ENGINEERING";
  }
  return "SHARED";
};

const memoryScope = (repositoryId: string | null): OrganizationalMemoryScope =>
  repositoryId ? "ENGINEERING" : "SHARED";

export class ExternalHarvestService {
  readonly #knowledgeGapHistory = new Map<
    string,
    Array<{
      objective: string;
      knownCount: number;
      missing: string[];
      assessedAt: string;
    }>
  >();
  readonly #observability = new Map<
    string,
    {
      brainFirstLookups: number;
      memorySufficient: number;
      memoryLatencyTotalMs: number;
      memoryLatencySamples: number;
    }
  >();

  constructor(
    readonly agentOs: AgentOsService,
    readonly memoryStore: MemoryStore,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
    readonly aiRouter?: AIRouterService,
    readonly workflowStore?: WorkflowStore,
    readonly desktopSkillStore?: DesktopSkillStore,
    readonly sandbox = new DockerNodeTestSandbox(),
  ) {}

  async dashboard(ownerId: string) {
    await this.agentOs.dashboard(ownerId);
    return ExternalHarvestDashboardSchema.parse({
      manifest: EXTERNAL_HARVEST_MANIFEST,
      developmentDepartment: {
        agents: [
          "engineering_manager",
          "planning_agent",
          "coding_agent",
          "testing_agent",
          "software_architect",
          "qa_engineer",
          "research_engineer",
        ],
        reviewers: [
          "code_review_reviewer",
          "security_review_reviewer",
          "performance_review_reviewer",
          "database_review_reviewer",
          "typescript_review_reviewer",
        ],
        workflow: "development_review_loop_v1",
      },
      authority: {
        alexaGovernanceAuthoritative: true,
        aiRouterRequired: true,
        alexaMemoryRequired: true,
        capabilityGovernanceRequired: true,
        externalRuntimesActive: false,
      },
    });
  }

  async knowledgeGaps(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = KnowledgeGapRequestSchema.parse(input.body);
    const dashboard = await this.agentOs.dashboard(input.ownerId);
    const agent = dashboard.manifests.find((item) => item.id === body.agentId);
    if (!agent) {
      throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent was not found.");
    }
    const sourceById = new Map(
      dashboard.knowledgeSources.map((source) => [source.id, source]),
    );
    const permittedScopes = [
      ...new Set(
        agent.knowledgeSourceRefs
          .map((id) => sourceById.get(id))
          .filter((source) => source !== undefined)
          .map((source) => sourceScope(source.sourceType)),
      ),
    ].sort();
    const known: Array<{ fact: string; memoryIds: string[] }> = [];
    const missing: string[] = [];
    for (const fact of body.requiredFacts) {
      const candidates = await this.memoryStore.searchMemories(input.ownerId, {
        q: fact,
        limit: 10,
      });
      const visible = candidates.filter((memory) =>
        permittedScopes.includes(memoryScope(memory.repositoryId)),
      );
      if (visible.length === 0) missing.push(fact);
      else known.push({ fact, memoryIds: visible.map((memory) => memory.id) });
    }
    await this.audit({
      eventType: "KNOWLEDGE_GAP_ASSESSED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Bounded owner-scoped knowledge gaps assessed.",
      requestId: input.requestId,
      metadata: {
        agentId: body.agentId,
        knownCount: known.length,
        missingCount: missing.length,
      },
    });
    const history = this.#knowledgeGapHistory.get(input.ownerId) ?? [];
    history.unshift({
      objective: body.objective,
      knownCount: known.length,
      missing,
      assessedAt: this.now().toISOString(),
    });
    this.#knowledgeGapHistory.set(input.ownerId, history.slice(0, 20));
    return KnowledgeGapResponseSchema.parse({
      objective: body.objective,
      agentId: body.agentId,
      permittedScopes,
      known,
      missing,
      fabricatedFacts: false,
    });
  }

  async brainFirstLookup(input: { ownerId: string; body: unknown }) {
    const started = performance.now();
    const body = BrainFirstLookupRequestSchema.parse(input.body);
    const dashboard = await this.agentOs.dashboard(input.ownerId);
    const agent = dashboard.manifests.find((item) => item.id === body.agentId);
    if (!agent) {
      throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent was not found.");
    }
    const sourceById = new Map(
      dashboard.knowledgeSources.map((source) => [source.id, source]),
    );
    const permittedScopes = [
      ...new Set(
        agent.knowledgeSourceRefs
          .map((id) => sourceById.get(id))
          .filter((source) => source !== undefined)
          .map((source) => sourceScope(source.sourceType)),
      ),
    ].sort();
    const memories = (
      await this.memoryStore.searchMemories(input.ownerId, {
        q: body.query,
        limit: 20,
      })
    ).filter((memory) => permittedScopes.includes(memoryScope(memory.repositoryId)));
    const sufficient = memories.length >= body.minimumEvidence;
    const metrics = this.#observability.get(input.ownerId) ?? {
      brainFirstLookups: 0,
      memorySufficient: 0,
      memoryLatencyTotalMs: 0,
      memoryLatencySamples: 0,
    };
    metrics.brainFirstLookups += 1;
    metrics.memorySufficient += sufficient ? 1 : 0;
    metrics.memoryLatencyTotalMs += performance.now() - started;
    metrics.memoryLatencySamples += 1;
    this.#observability.set(input.ownerId, metrics);
    return BrainFirstLookupResponseSchema.parse({
      agentId: body.agentId,
      query: body.query,
      permittedScopes,
      memoryIds: memories.map((memory) => memory.id),
      sufficient,
      externalRetrievalRecommended: !sufficient,
      externalRetrievalStarted: false,
      fabricatedFacts: false,
    });
  }

  async prepareDelegation(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = PrepareDelegationRequestSchema.parse(input.body);
    const dashboard = await this.agentOs.dashboard(input.ownerId);
    const manager = dashboard.manifests.find(
      (agent) => agent.id === body.managerAgentId,
    );
    const specialist = dashboard.manifests.find(
      (agent) => agent.id === body.specialistAgentId,
    );
    if (!manager || !specialist) {
      throw new ExecutionError(
        404,
        "AGENT_NOT_FOUND",
        "Delegation agent was not found.",
      );
    }
    const sourceById = new Map(
      dashboard.knowledgeSources.map((source) => [source.id, source]),
    );
    const specialistScopes = new Set(
      specialist.knowledgeSourceRefs
        .map((id) => sourceById.get(id))
        .filter((source) => source !== undefined)
        .map((source) => sourceScope(source.sourceType)),
    );
    const allowedMemoryScopes = body.requestedMemoryScopes.filter((scope) =>
      specialistScopes.has(scope),
    );
    const allowedCapabilities = body.requestedCapabilities.filter((capability) =>
      specialist.capabilityRefs.includes(capability),
    );
    const rejectedRequests = [
      ...body.requestedMemoryScopes
        .filter((scope) => !allowedMemoryScopes.includes(scope))
        .map((scope) => `memory:${scope}`),
      ...body.requestedCapabilities
        .filter((capability) => !allowedCapabilities.includes(capability))
        .map((capability) => `capability:${capability}`),
      ...body.requestedSkills.map((skill) => `skill:${skill}`),
    ];
    const prepared = PreparedDelegationSchema.parse({
      delegationId: crypto.randomUUID(),
      ownerId: input.ownerId,
      managerAgentId: manager.id,
      specialistAgentId: specialist.id,
      task: body.task,
      contextSummary: body.contextSummary,
      allowedMemoryScopes,
      allowedCapabilities,
      allowedSkills: [],
      rejectedRequests,
      tokenBudget: Math.min(
        body.tokenBudget,
        specialist.runtimeConfiguration.contextLimitTokens,
      ),
      costBudgetUsd: body.costBudgetUsd,
      sandbox: {
        id: "registered_validation_readonly",
        hostShellAllowed: false,
        arbitraryCommandsAllowed: false,
        networkAccess: false,
        writableHostFilesystem: false,
      },
      parentTranscriptIncluded: false,
      directProviderAccess: false,
      canApprove: false,
      executionStarted: false,
      resultContract: {
        summaryRequired: true,
        evidenceRefsRequired: true,
        proposedActionsOnly: true,
      },
      preparedAt: this.now().toISOString(),
    });
    await this.audit({
      eventType: "AGENT_DELEGATION_PREPARED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Isolated advisory delegation prepared without execution authority.",
      requestId: input.requestId,
      metadata: {
        delegationId: prepared.delegationId,
        managerAgentId: manager.id,
        specialistAgentId: specialist.id,
        rejectedRequestCount: rejectedRequests.length,
      },
    });
    return prepared;
  }

  async executeDelegation(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
    signal?: AbortSignal;
  }) {
    if (!this.aiRouter) {
      throw new ExecutionError(
        503,
        "AI_ROUTER_UNAVAILABLE",
        "Canonical AIRouter is unavailable.",
      );
    }
    const body = ExecuteDelegationRequestSchema.parse(input.body);
    const { developmentInput: _developmentInput, ...prepareBody } = body;
    void _developmentInput;
    const startedAt = this.now().toISOString();
    const prepared = await this.prepareDelegation({
      ownerId: input.ownerId,
      body: prepareBody,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    const osDashboard = await this.agentOs.dashboard(input.ownerId);
    const sourceById = new Map(
      osDashboard.knowledgeSources.map((source) => [source.id, source]),
    );
    const specialist = osDashboard.manifests.find(
      (agent) => agent.id === prepared.specialistAgentId,
    );
    if (!specialist) {
      throw new ExecutionError(404, "AGENT_NOT_FOUND", "Specialist was not found.");
    }
    const knowledgeSourceRefs = specialist.knowledgeSourceRefs.filter((id) => {
      const source = sourceById.get(id);
      return (
        source && prepared.allowedMemoryScopes.includes(sourceScope(source.sourceType))
      );
    });
    const memoryCandidates = await this.memoryStore.searchMemories(input.ownerId, {
      q: `${body.task} ${body.contextSummary}`.slice(0, 1_000),
      limit: 12,
    });
    const visibleMemories = memoryCandidates.filter((memory) =>
      prepared.allowedMemoryScopes.includes(memoryScope(memory.repositoryId)),
    );
    const runtime = await this.agentOs.startIsolatedDelegation({
      ownerId: input.ownerId,
      managerAgentId: prepared.managerAgentId,
      specialistAgentId: prepared.specialistAgentId,
      delegationId: prepared.delegationId,
      task: prepared.task,
      contextSummary: prepared.contextSummary,
      memoryRefs: visibleMemories.map((memory) => memory.id),
      memoryScopes: prepared.allowedMemoryScopes,
      capabilityRefs: prepared.allowedCapabilities,
      skillRefs: prepared.allowedSkills,
      knowledgeSourceRefs,
      contextTokenBudget: prepared.tokenBudget,
      sandboxProfileId: prepared.sandbox.id,
      requestId: input.requestId,
    });
    const requestId = crypto.randomUUID();
    let delegationSettled = false;
    try {
      const routed = await this.aiRouter.executeStructured(
        {
          requestId,
          purpose: body.developmentInput ? "CODING" : "REASONING",
          requestedRole: body.developmentInput ? "CODER" : "GENERAL_REASONER",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: body.developmentInput
                    ? `${prepared.task}\n\nTest objective: ${body.developmentInput.testObjective}`
                    : prepared.task,
                },
              ],
            },
          ],
          systemInstructions: [
            "You are an Alexa specialist working inside a bounded delegated task.",
            "Return only the requested structured result. Do not execute tools, approve actions, expand scope, or claim work was performed unless sandbox evidence is supplied.",
            body.developmentInput
              ? "When a test is useful, propose one Node.js CommonJS test file named generated.test.cjs that imports ./source.cjs."
              : "Do not propose executable code unless the task explicitly requires it.",
          ],
          context: [
            {
              sourceType: "AGENT",
              trustLevel: "TRUSTED",
              content: {
                role: runtime.specialist.displayName,
                boundedContextSummary: prepared.contextSummary,
                memoryEvidence: visibleMemories.map((memory) => ({
                  id: memory.id,
                  summary: memory.summary,
                  confidence: memory.confidence,
                })),
                allowedMemoryScopes: prepared.allowedMemoryScopes,
                allowedCapabilities: prepared.allowedCapabilities,
                allowedSkills: prepared.allowedSkills,
                sandboxProfile: prepared.sandbox,
                parentTranscriptIncluded: false,
                ...(body.developmentInput
                  ? { sourceCode: body.developmentInput.sourceCode }
                  : {}),
              },
            },
          ],
          outputMode: "STRUCTURED",
          schema: SpecialistReasoningOutputSchema,
          schemaName: "alexa_specialist_delegation_result",
          temperature: 0.1,
          maxOutputTokens: 2_000,
          reasoning: "MEDIUM",
          timeoutMs: 90_000,
          risk: "LOW",
          privacy: "STANDARD",
          locality: "PREFER_LOCAL",
          allowCloud: true,
          allowFallback: true,
          allowClarification: false,
          maxAttempts: 2,
          maxCloudEscalations: 1,
          maxCostUsd: String(Math.min(body.costBudgetUsd, 5)),
          maxContextTokens: prepared.tokenBudget,
          economicMaxInputTokens: prepared.tokenBudget,
          agentId: prepared.specialistAgentId,
          taskId: prepared.delegationId,
          economicContext: {
            ownerId: input.ownerId,
            purpose: body.developmentInput ? "CODING" : "REASONING",
            autonomyMode: "ASSISTED",
            taskId: prepared.delegationId,
            costCenter: "external-harvest-delegation",
          },
          metadata: {
            delegationId: prepared.delegationId,
            managerAgentId: prepared.managerAgentId,
            parentTranscriptIncluded: false,
          },
        },
        input.signal ? { signal: input.signal } : {},
      );
      const reasoning = SpecialistReasoningOutputSchema.safeParse(
        routed.structuredOutput,
      );
      if (routed.outcome !== "SUCCESS" || !reasoning.success) {
        throw new ExecutionError(
          502,
          "SPECIALIST_INFERENCE_FAILED",
          "Specialist inference did not return a valid structured result.",
        );
      }
      const tests =
        body.developmentInput && reasoning.data.proposedTest
          ? await this.sandbox.execute({
              sourceCode: body.developmentInput.sourceCode,
              testCode: reasoning.data.proposedTest.content,
              ...(input.signal ? { signal: input.signal } : {}),
            })
          : null;
      if (tests) {
        await this.audit({
          eventType: "AGENT_SANDBOX_EXECUTED",
          ownerId: input.ownerId,
          ipAddress: input.ipAddress,
          outcome: tests.status === "PASSED" ? "SUCCESS" : "FAILURE",
          reason: "Delegated test executed in the registered isolated sandbox.",
          requestId: input.requestId,
          metadata: {
            delegationId: prepared.delegationId,
            providerId: tests.providerId,
            sandboxStatus: tests.status,
            network: tests.network,
            hostWrites: tests.hostWrites,
          },
        });
      }
      const sandboxFailed = Boolean(
        body.developmentInput &&
        (!tests || !["PASSED", "FAILED"].includes(tests.status)),
      );
      const errors = sandboxFailed
        ? [tests?.stderr || "The registered Docker sandbox is unavailable."]
        : [];
      const completedAt = this.now().toISOString();
      const result = DelegationResultSchema.parse({
        delegationId: prepared.delegationId,
        sessionId: runtime.session.id,
        status: sandboxFailed ? "FAILED" : "COMPLETE",
        summary: reasoning.data.summary,
        findings: reasoning.data.findings,
        artifacts: reasoning.data.proposedTest
          ? [
              {
                name: reasoning.data.proposedTest.filename,
                kind: "PROPOSED_TEST",
                content: reasoning.data.proposedTest.content,
              },
            ]
          : [],
        tests,
        confidence: reasoning.data.confidence,
        errors,
        ai: {
          requestId: routed.requestId,
          providerId: routed.providerId ?? "unknown",
          modelId: routed.modelId ?? "unknown",
          latencyMs: routed.latencyMs,
          routedThroughAIRouter: true,
        },
        context: {
          parentTranscriptIncluded: false,
          memoryScopes: prepared.allowedMemoryScopes,
          memoryCount: visibleMemories.length,
          capabilityRefs: prepared.allowedCapabilities,
          contextCharacters:
            prepared.contextSummary.length +
            visibleMemories.reduce((sum, memory) => sum + memory.summary.length, 0),
        },
        startedAt,
        completedAt,
      });
      await this.agentOs.completeIsolatedDelegation({
        ownerId: input.ownerId,
        sessionId: runtime.session.id,
        outputSummary: result.summary,
        confidence: result.confidence,
        aiRequestId: result.ai.requestId,
        providerId: result.ai.providerId,
        modelId: result.ai.modelId,
        artifactCount: result.artifacts.length,
        sandboxStatus:
          result.tests?.status === "PASSED"
            ? "PASSED"
            : result.tests?.status === "FAILED"
              ? "FAILED"
              : "UNAVAILABLE",
        errorCode: result.status === "FAILED" ? "SANDBOX_UNAVAILABLE" : null,
        requestId: input.requestId,
      });
      delegationSettled = true;
      await this.audit({
        eventType:
          result.status === "COMPLETE"
            ? "AGENT_DELEGATION_EXECUTED"
            : "AGENT_DELEGATION_FAILED",
        ownerId: input.ownerId,
        ipAddress: input.ipAddress,
        outcome: result.status === "COMPLETE" ? "SUCCESS" : "FAILURE",
        reason:
          result.status === "COMPLETE"
            ? "Isolated specialist delegation completed through AIRouter."
            : "Isolated specialist delegation failed closed.",
        requestId: input.requestId,
        metadata: {
          delegationId: result.delegationId,
          sessionId: result.sessionId,
          sandboxStatus: result.tests?.status ?? "NOT_REQUESTED",
          parentTranscriptIncluded: false,
        },
      });
      return result;
    } catch (error) {
      if (!delegationSettled) {
        await this.agentOs.completeIsolatedDelegation({
          ownerId: input.ownerId,
          sessionId: runtime.session.id,
          outputSummary: "Specialist delegation failed closed.",
          confidence: 0,
          aiRequestId: requestId,
          providerId: "unavailable",
          modelId: "unavailable",
          artifactCount: 0,
          sandboxStatus: "UNAVAILABLE",
          errorCode: "SPECIALIST_EXECUTION_FAILED",
          requestId: input.requestId,
        });
      }
      await this.audit({
        eventType: "AGENT_DELEGATION_FAILED",
        ownerId: input.ownerId,
        ipAddress: input.ipAddress,
        outcome: "FAILURE",
        reason: "Isolated specialist delegation failed closed.",
        requestId: input.requestId,
        metadata: {
          delegationId: prepared.delegationId,
          parentTranscriptIncluded: false,
        },
      });
      throw error;
    }
  }

  async brainSummary(ownerId: string) {
    const [dashboard, memories, knowledgeNodes, knowledgeEdges, workflows, skills] =
      await Promise.all([
        this.agentOs.dashboard(ownerId),
        this.memoryStore.listMemories(ownerId, 1_000),
        this.memoryStore.listKnowledgeNodes(ownerId, 1_000),
        this.memoryStore.listKnowledgeEdges(ownerId, 2_000),
        this.workflowStore?.list(ownerId, 500) ?? [],
        this.desktopSkillStore?.listDesktopSkills(ownerId, 500) ?? [],
      ]);
    const delegations = dashboard.sessions
      .filter((session) => session.delegation !== null)
      .slice(0, 20);
    const activeDelegation = delegations.find(
      (session) => session.status === "running",
    );
    const aiActivity = this.aiRouter?.activity() ?? [];
    const latestAi = aiActivity[0];
    const aiMetrics = this.aiRouter?.metrics();
    const capabilities = new Set(
      dashboard.manifests.flatMap((manifest) => manifest.capabilityRefs),
    );
    const gaps = this.#knowledgeGapHistory.get(ownerId) ?? [];
    const observability = this.#observability.get(ownerId) ?? {
      brainFirstLookups: 0,
      memorySufficient: 0,
      memoryLatencyTotalMs: 0,
      memoryLatencySamples: 0,
    };
    const memoryConfidence =
      memories.length === 0
        ? null
        : memories.reduce((sum, memory) => sum + memory.confidence, 0) /
          memories.length;
    const orphanCount = knowledgeNodes.filter(
      (node) =>
        !knowledgeEdges.some(
          (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
        ),
    ).length;
    const activeWorkflowCount = workflows.filter(
      (workflow) => !["COMPLETED", "CANCELLED", "FAILED"].includes(workflow.status),
    ).length;
    const organization = dashboard.manifests.map((manifest) => {
      const reviewer = ["review_agent", "security_agent"].includes(manifest.id);
      return {
        id: manifest.id,
        label: manifest.displayName,
        parentId: manifest.id === "engineering_manager" ? null : "engineering_manager",
        kind:
          manifest.id === "engineering_manager"
            ? ("MANAGER" as const)
            : reviewer
              ? ("REVIEWER" as const)
              : ("SPECIALIST" as const),
        status: manifest.status,
        memoryScopes: ["SHARED", "ENGINEERING"] as OrganizationalMemoryScope[],
        capabilityCount: manifest.capabilityRefs.length,
        provenanceProject: [
          "software_architect",
          "qa_engineer",
          "research_engineer",
        ].includes(manifest.id)
          ? ("everything_claude_code" as const)
          : null,
      };
    });
    const aiActive = latestAi?.outcome === "SUCCESS" && latestAi.latencyMs >= 0;
    return BrainRuntimeSummarySchema.parse({
      generatedAt: this.now().toISOString(),
      nodes: [
        {
          id: "memory",
          label: "Memory",
          status: memories.length > 0 ? "HEALTHY" : "IDLE",
          value: `${memories.length} memories`,
          detail: [`Average confidence ${Math.round((memoryConfidence ?? 0) * 100)}%`],
          active: observability.brainFirstLookups > 0,
        },
        {
          id: "context",
          label: "Context",
          status: activeDelegation ? "ACTIVE" : "IDLE",
          value: activeDelegation ? "Delegation context active" : "No active context",
          detail: activeDelegation
            ? [
                `${activeDelegation.reasoningStatistics.memoryRetrievalCount} scoped memories`,
              ]
            : ["Awaiting a bounded runtime context"],
          active: Boolean(activeDelegation),
        },
        {
          id: "agents",
          label: "Agents",
          status: activeDelegation ? "ACTIVE" : "HEALTHY",
          value: `${dashboard.manifests.length} registered`,
          detail: [
            `${delegations.filter((item) => item.status === "running").length} delegations running`,
          ],
          active: Boolean(activeDelegation),
        },
        {
          id: "skills",
          label: "Skills",
          status: skills.length > 0 ? "HEALTHY" : "IDLE",
          value: `${skills.length} active`,
          detail: ["Alexa-owned skill registry"],
          active: false,
        },
        {
          id: "workflows",
          label: "Workflows",
          status: activeWorkflowCount > 0 ? "ACTIVE" : "IDLE",
          value: `${activeWorkflowCount} active`,
          detail: [`${workflows.length} registered workflows`],
          active: activeWorkflowCount > 0,
        },
        {
          id: "capabilities",
          label: "Capabilities",
          status: capabilities.size > 0 ? "HEALTHY" : "IDLE",
          value: `${capabilities.size} finite`,
          detail: ["Registered authority only"],
          active: false,
        },
        {
          id: "ai",
          label: "AI",
          status: aiActive ? "ACTIVE" : "HEALTHY",
          value: latestAi?.modelId ?? "AIRouter ready",
          detail: latestAi
            ? [
                latestAi.providerId ?? "Provider unavailable",
                `${Math.round(latestAi.latencyMs)}ms`,
              ]
            : ["No recent routed request"],
          active: aiActive,
        },
        {
          id: "knowledge",
          label: "Knowledge",
          status: gaps.some((gap) => gap.missing.length > 0) ? "WARNING" : "HEALTHY",
          value: `${knowledgeNodes.length} entities`,
          detail: [
            `${knowledgeEdges.length} relationships`,
            `${gaps.reduce((sum, gap) => sum + gap.missing.length, 0)} open gaps`,
          ],
          active: gaps.length > 0,
        },
      ],
      cognitivePath: [
        { stage: "VOICE", state: "NOT_USED" },
        { stage: "UNDERSTANDING", state: "NOT_USED" },
        {
          stage: "MEMORY",
          state:
            activeDelegation &&
            visibleValue(activeDelegation.reasoningStatistics.memoryRetrievalCount)
              ? "USED"
              : "NOT_USED",
        },
        { stage: "CONTEXT", state: activeDelegation ? "USED" : "NOT_USED" },
        { stage: "AI", state: aiActive ? "USED" : "NOT_USED" },
        { stage: "PLANNER", state: "NOT_USED" },
        {
          stage: "CAPABILITY",
          state: activeDelegation?.delegation?.capabilityRefs.length
            ? "USED"
            : "NOT_USED",
        },
        {
          stage: "RESULT",
          state:
            delegations[0]?.status === "completed"
              ? "USED"
              : activeDelegation
                ? "ACTIVE"
                : "NOT_USED",
        },
      ],
      cognition: {
        intent: activeDelegation?.inputSummary ?? "No active delegated task",
        context: activeDelegation ? "Bounded specialist context" : "No active context",
        memory: `${activeDelegation?.reasoningStatistics.memoryRetrievalCount ?? 0} relevant memories`,
        ai: latestAi
          ? `${latestAi.providerId ?? "unknown"} · ${latestAi.modelId ?? "unknown"}`
          : "No recent route",
        knowledgeConfidence: memoryConfidence,
        missingInformation: gaps.reduce((sum, gap) => sum + gap.missing.length, 0),
      },
      brainHealth: {
        memory: memories.length > 0 ? "HEALTHY" : "DEGRADED",
        embeddings: null,
        knowledgeGraph: knowledgeNodes.length > 0 ? "HEALTHY" : "DEGRADED",
        conflicts: 0,
        gaps: gaps.reduce((sum, gap) => sum + gap.missing.length, 0),
        orphans: orphanCount,
      },
      knowledgeNeighborhood: knowledgeNodes.slice(0, 24).map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        connectionCount: knowledgeEdges.filter(
          (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
        ).length,
        confidence: node.confidence,
      })),
      organization,
      delegations,
      knowledgeGaps: gaps,
      observability: {
        brainFirstLookups: observability.brainFirstLookups,
        memorySufficient: observability.memorySufficient,
        aiRequired: Math.max(0, (aiMetrics?.total ?? 0) - (aiMetrics?.noAI ?? 0)),
        deterministicResolutions: aiMetrics?.noAI ?? 0,
        memoryFirstAverageLatencyMs:
          observability.memoryLatencySamples > 0
            ? observability.memoryLatencyTotalMs / observability.memoryLatencySamples
            : null,
        aiAverageLatencyMs:
          aiActivity.length > 0
            ? aiActivity.reduce((sum, item) => sum + item.latencyMs, 0) /
              aiActivity.length
            : null,
      },
    });
  }
}

const visibleValue = (value: number) => value > 0;
