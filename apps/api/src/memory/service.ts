import {
  AgentMemoryRecordSchema,
  CreateDecisionRequestSchema,
  CreateMemoryRequestSchema,
  EngineeringDecisionRecordSchema,
  KnowledgeEdgeSchema,
  KnowledgeGraphResponseSchema,
  KnowledgeNodeSchema,
  LearningEventRecordSchema,
  MemoryCenterResponseSchema,
  MemoryRecordSchema,
  MemorySearchQuerySchema,
  MemorySearchResponseSchema,
  MemorySuggestionRecordSchema,
  MemoryStatisticsSchema,
  MemoryTimelineEventSchema,
  RepositoryMemoryRecordSchema,
  type MemoryRecord,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentStore } from "../agents/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { WorkflowStore } from "../workflows/store.js";
import type { MemoryStore } from "./store.js";

export class MemoryIndexerService {
  constructor(
    readonly store: MemoryStore,
    readonly repositoryStore: RepositoryStore,
    readonly agentStore: AgentStore,
    readonly workflowStore: WorkflowStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async center(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return MemoryCenterResponseSchema.parse({
      statistics: await this.statistics(ownerId),
      recentMemories: await this.store.listMemories(ownerId, 25),
      decisions: await this.store.listDecisions(ownerId, 25),
      suggestions: await this.store.listSuggestions(ownerId, 25),
      timeline: await this.store.listTimeline(ownerId, 50),
      graph: await this.graph(ownerId, 200, 400),
    });
  }

  async search(ownerId: string, query: unknown) {
    const parsed = MemorySearchQuerySchema.parse(query);
    const memories = await this.store.searchMemories(ownerId, parsed);
    for (const memory of memories) {
      await this.store.saveMemory({
        ...memory,
        lastAccessedAt: this.now().toISOString(),
      });
    }
    return MemorySearchResponseSchema.parse({ query: parsed, memories });
  }

  async graph(ownerId: string, nodeLimit = 500, edgeLimit = 1_000) {
    return KnowledgeGraphResponseSchema.parse({
      nodes: await this.store.listKnowledgeNodes(ownerId, nodeLimit),
      edges: await this.store.listKnowledgeEdges(ownerId, edgeLimit),
    });
  }

  async statistics(ownerId: string) {
    const memories = await this.store.listMemories(ownerId, 10_000);
    const decisions = await this.store.listDecisions(ownerId, 10_000);
    const suggestions = await this.store.listSuggestions(ownerId, 10_000);
    const nodes = await this.store.listKnowledgeNodes(ownerId, 10_000);
    const edges = await this.store.listKnowledgeEdges(ownerId, 10_000);
    const memoryCountByType = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      preference: 0,
      repository: 0,
      agent: 0,
    };
    let confidenceTotal = 0;
    for (const memory of memories) {
      memoryCountByType[memory.memoryType] += 1;
      confidenceTotal += memory.confidence;
    }
    return MemoryStatisticsSchema.parse({
      totalMemories: memories.length,
      memoryCountByType,
      decisionCount: decisions.length,
      knowledgeNodeCount: nodes.length,
      knowledgeEdgeCount: edges.length,
      openSuggestionCount: suggestions.filter(
        (suggestion) => suggestion.status === "open",
      ).length,
      averageConfidence: memories.length ? confidenceTotal / memories.length : 0,
    });
  }

  async recordMemory(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateMemoryRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const memory = MemoryRecordSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      repositoryId: parsed.repositoryId ?? null,
      agentId: parsed.agentId ?? null,
      workflowId: parsed.workflowId ?? null,
      memoryType: parsed.memoryType,
      source: parsed.source,
      title: parsed.title,
      summary: parsed.summary,
      content: parsed.content,
      tags: parsed.tags,
      importance: parsed.importance,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      version: 1,
      createdAt: at,
      updatedAt: at,
      lastAccessedAt: null,
      expiresAt: parsed.expiresAt ?? null,
    });
    await this.store.saveMemory(memory);
    await this.saveNodeForMemory(memory);
    await this.store.saveTimelineEvent(
      MemoryTimelineEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        occurredAt: at,
        eventType: "MEMORY_RECORDED",
        title: memory.title,
        summary: memory.summary,
        linkedMemoryIds: [memory.id],
        linkedDecisionIds: [],
      }),
    );
    await this.audit({
      eventType: "MEMORY_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Cognitive memory recorded.",
      requestId: input.requestId,
      metadata: {
        memoryId: memory.id,
        memoryType: memory.memoryType,
        source: memory.source,
      },
    });
    return { memory };
  }

  async recordDecision(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
    approver: string;
  }) {
    const parsed = CreateDecisionRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const decision = EngineeringDecisionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      repositoryId: parsed.repositoryId ?? null,
      workflowId: parsed.workflowId ?? null,
      decision: parsed.decision,
      reason: parsed.reason,
      alternatives: parsed.alternatives,
      evidence: parsed.evidence,
      approver: input.approver,
      status: "active",
      supersedesDecisionId: parsed.supersedesDecisionId ?? null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveDecision(decision);
    await this.store.saveMemory(
      MemoryRecordSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        repositoryId: decision.repositoryId,
        agentId: null,
        workflowId: decision.workflowId,
        memoryType: "semantic",
        source: "owner",
        title: `Decision: ${decision.decision}`,
        summary: decision.reason,
        content: `Alternatives considered: ${decision.alternatives.join("; ")}`,
        tags: ["decision", "architecture"],
        importance: 90,
        confidence: 1,
        evidence: decision.evidence,
        version: 1,
        createdAt: at,
        updatedAt: at,
        lastAccessedAt: null,
        expiresAt: null,
      }),
    );
    const decisionNode = KnowledgeNodeSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      kind: "decision",
      label: decision.decision,
      refId: decision.id,
      summary: decision.reason,
      confidence: 1,
      evidence: decision.evidence,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveKnowledgeNode(decisionNode);
    await this.store.saveTimelineEvent(
      MemoryTimelineEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        occurredAt: at,
        eventType: "ENGINEERING_DECISION_LOGGED",
        title: decision.decision,
        summary: decision.reason,
        linkedMemoryIds: [],
        linkedDecisionIds: [decision.id],
      }),
    );
    await this.audit({
      eventType: "ENGINEERING_DECISION_LOGGED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Engineering decision logged.",
      requestId: input.requestId,
      metadata: { decisionId: decision.id, status: decision.status },
    });
    return { decision };
  }

  async decisions(ownerId: string) {
    return this.store.listDecisions(ownerId, 200);
  }

  async repositoryMemory(ownerId: string, repositoryId: string) {
    return this.store.getRepositoryMemory(ownerId, repositoryId);
  }

  async agentMemory(ownerId: string, agentId: string) {
    return this.store.getAgentMemory(ownerId, agentId);
  }

  async timeline(ownerId: string) {
    return this.store.listTimeline(ownerId, 500);
  }

  async suggestions(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listSuggestions(ownerId, 200);
  }

  async ensureBaseline(ownerId: string) {
    await this.consolidateRepositoryMemory(ownerId);
    await this.consolidateAgentMemory(ownerId);
    await this.ensureDefaultSuggestions(ownerId);
  }

  async consolidateRepositoryMemory(ownerId: string) {
    const at = this.now().toISOString();
    const repositories = await this.repositoryStore.listRepositories(ownerId);
    for (const repository of repositories) {
      const existing = await this.store.getRepositoryMemory(ownerId, repository.id);
      if (existing) continue;
      const memory = RepositoryMemoryRecordSchema.parse({
        ownerId,
        repositoryId: repository.id,
        architectureSummary: `Repository ${repository.workspaceId} is registered for read-only intelligence. Long-term architecture details are consolidated from repository generations and semantic records as they become available.`,
        commonFiles: [],
        knownIssues: [],
        technicalDebt: [],
        lastConsolidatedAt: at,
        confidence: 0.55,
      });
      await this.store.saveRepositoryMemory(memory);
      const node = KnowledgeNodeSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        kind: "repository",
        label: repository.workspaceId,
        refId: repository.id,
        summary: memory.architectureSummary,
        confidence: memory.confidence,
        evidence: [
          {
            sourceType: "repository",
            reference: repository.id,
            excerpt: repository.workspaceId,
            observedAt: at,
          },
        ],
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveKnowledgeNode(node);
    }
  }

  async consolidateAgentMemory(ownerId: string) {
    const at = this.now().toISOString();
    const agents = await this.agentStore.listAgents(ownerId);
    const metrics = await this.agentStore.listMetrics(ownerId);
    for (const agent of agents) {
      const existing = await this.store.getAgentMemory(ownerId, agent.id);
      if (existing) continue;
      const metric = metrics.find((candidate) => candidate.agentId === agent.id);
      const successRate =
        metric && metric.completedTaskCount + metric.failedTaskCount > 0
          ? metric.completedTaskCount /
            (metric.completedTaskCount + metric.failedTaskCount)
          : 1;
      await this.store.saveAgentMemory(
        AgentMemoryRecordSchema.parse({
          ownerId,
          agentId: agent.id,
          expertise: agent.capabilities.slice(0, 20),
          successRate,
          commonMistakes: [],
          preferredReasoningPaths: agent.supportedTasks.slice(0, 20),
          lastUpdatedAt: at,
        }),
      );
      await this.store.saveKnowledgeNode(
        KnowledgeNodeSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          kind: "agent",
          label: agent.displayName,
          refId: agent.id,
          summary: agent.healthSummary,
          confidence: 0.9,
          evidence: [
            {
              sourceType: "agent",
              reference: agent.id,
              excerpt: agent.role,
              observedAt: at,
            },
          ],
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async ensureDefaultSuggestions(ownerId: string) {
    const existing = await this.store.listSuggestions(ownerId, 1);
    if (existing.length > 0) return;
    const at = this.now().toISOString();
    const learning = LearningEventRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      repositoryId: null,
      agentId: null,
      workflowId: null,
      kind: "pattern_observed",
      summary:
        "Phase 8 memory is active. Suggestions are evidence-backed and remain advisory only.",
      confidenceDelta: 0.1,
      evidence: [
        {
          sourceType: "manual",
          reference: "Phase 8 acceptance criteria",
          excerpt: "Autonomous suggestions must never perform actions automatically.",
          observedAt: at,
        },
      ],
      createdAt: at,
    });
    await this.store.saveLearningEvent(learning);
    await this.store.saveSuggestion(
      MemorySuggestionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        repositoryId: null,
        title: "Start capturing architecture decisions",
        rationale:
          "The memory layer becomes more useful when major implementation choices are logged with alternatives and evidence.",
        suggestedAction:
          "Use the Decision Log to record the next security, architecture, or deployment decision before starting a workflow.",
        riskLevel: "low",
        confidence: 0.82,
        evidence: learning.evidence,
        status: "open",
        createdAt: at,
        updatedAt: at,
      }),
    );
  }

  async connectMemoryToDecision(
    ownerId: string,
    memory: MemoryRecord,
    decisionNodeId: string,
  ) {
    const at = this.now().toISOString();
    const memoryNode = KnowledgeNodeSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      kind: "memory",
      label: memory.title,
      refId: memory.id,
      summary: memory.summary,
      confidence: memory.confidence,
      evidence: memory.evidence,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveKnowledgeNode(memoryNode);
    await this.store.saveKnowledgeEdge(
      KnowledgeEdgeSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        sourceNodeId: memoryNode.id,
        targetNodeId: decisionNodeId,
        relation: "derived_from",
        confidence: Math.min(memory.confidence, 0.9),
        evidence: memory.evidence,
        createdAt: at,
      }),
    );
  }

  async saveNodeForMemory(memory: MemoryRecord) {
    const at = this.now().toISOString();
    await this.store.saveKnowledgeNode(
      KnowledgeNodeSchema.parse({
        id: crypto.randomUUID(),
        ownerId: memory.ownerId,
        kind: memory.memoryType === "preference" ? "preference" : "memory",
        label: memory.title,
        refId: memory.id,
        summary: memory.summary,
        confidence: memory.confidence,
        evidence: memory.evidence,
        createdAt: at,
        updatedAt: at,
      }),
    );
  }
}
