import {
  AgentDecisionLogRecordSchema,
  CognitiveDashboardResponseSchema,
  CognitiveMemoryRecordSchema,
  CognitiveMetricsRecordSchema,
  CognitiveSearchQuerySchema,
  CognitiveSearchResponseSchema,
  CognitiveStateRecordSchema,
  ConfidenceRecordSchema,
  ContextPrioritizationResultSchema,
  CreateReasoningRequestSchema,
  CreateReflectionRequestSchema,
  ExperienceRecordSchema,
  LearningPipelineEventRecordSchema,
  MemoryConsolidationRecordSchema,
  ReflectionReportRecordSchema,
  ReasoningResponseSchema,
  SpecializationProfileRecordSchema,
  type AgentRecord,
  type CognitiveMemoryRecord,
  type MemoryEvidence,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { MemoryStore } from "../memory/store.js";
import type { AgentOsService } from "../agents/os-service.js";
import type { AgentStore } from "../agents/store.js";
import type { AgentCognitionStore } from "./store.js";

const defaultEvidence = (at: string, reference = "Agent cognition baseline") =>
  [
    {
      sourceType: "agent",
      reference,
      excerpt: "Generated from registered Agent OS and multi-agent metadata.",
      observedAt: at,
    },
  ] satisfies MemoryEvidence[];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export class AgentCognitionService {
  constructor(
    readonly store: AgentCognitionStore,
    readonly agentStore: AgentStore,
    readonly agentOs: AgentOsService,
    readonly memoryStore: MemoryStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    const contextPrioritization = await Promise.all(
      (await this.agentStore.listAgents(ownerId))
        .slice(0, 10)
        .map((agent) => this.prioritizeContext(ownerId, agent.id, "")),
    );
    return CognitiveDashboardResponseSchema.parse({
      workingMemory: await this.store.listMemory(ownerId, "working", 100),
      episodicMemory: await this.store.listMemory(ownerId, "episodic", 100),
      semanticMemory: await this.store.listMemory(ownerId, "semantic", 100),
      proceduralMemory: await this.store.listMemory(ownerId, "procedural", 100),
      relationships: await this.store.listRelationships(ownerId, 500),
      experiences: await this.store.listExperiences(ownerId, 100),
      decisions: await this.store.listDecisions(ownerId, 100),
      specializations: await this.store.listSpecializations(ownerId),
      reflections: await this.store.listReflections(ownerId, 100),
      confidenceHistory: await this.store.listConfidence(ownerId, 200),
      goals: await this.store.listGoals(ownerId, 100),
      states: await this.store.listStates(ownerId),
      learningEvents: await this.store.listLearningEvents(ownerId, 200),
      consolidations: await this.store.listConsolidations(ownerId, 100),
      metrics: await this.store.listMetrics(ownerId),
      contextPrioritization,
      advisoryOnly: true,
    });
  }

  async search(ownerId: string, query: unknown) {
    await this.ensureBaseline(ownerId);
    const parsed = CognitiveSearchQuerySchema.parse(query);
    const memories = await this.store.searchMemory(ownerId, parsed);
    for (const memory of memories) {
      await this.store.saveMemory({
        ...memory,
        lastAccessedAt: this.now().toISOString(),
      });
    }
    return CognitiveSearchResponseSchema.parse({ query: parsed, memories });
  }

  async reflect(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = CreateReflectionRequestSchema.parse(input.body);
    await this.requireAgent(input.ownerId, parsed.agentId);
    const at = this.now().toISOString();
    const reflection = ReflectionReportRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      objectives: parsed.objectives,
      qualitySummary: parsed.qualitySummary,
      mistakes: parsed.mistakes,
      missedOpportunities: parsed.missedOpportunities,
      unexpectedOutcomes: parsed.unexpectedOutcomes,
      lessonsLearned: parsed.lessonsLearned,
      reusablePatterns: parsed.reusablePatterns,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      createdAt: at,
    });
    await this.store.saveReflection(reflection);
    const promoted: CognitiveMemoryRecord[] = [];
    for (const lesson of parsed.lessonsLearned) {
      const memory = await this.saveCognitiveMemory({
        ownerId: input.ownerId,
        agentId: parsed.agentId,
        workflowId: parsed.workflowId ?? null,
        kind: "semantic",
        title: `Lesson: ${lesson.slice(0, 120)}`,
        summary: lesson,
        content: reflection.qualitySummary,
        tags: ["lesson", "reflection", parsed.agentId],
        importance: 80,
        confidence: parsed.confidence,
        evidence: parsed.evidence,
        validationStatus: "agent_validated",
        at,
      });
      promoted.push(memory);
    }
    await this.store.saveExperience(
      ExperienceRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        agentId: parsed.agentId,
        workflowId: parsed.workflowId ?? null,
        outcome: parsed.mistakes.length > 0 ? "partial" : "success",
        impact: parsed.lessonsLearned.length > 2 ? "medium" : "low",
        context: parsed.qualitySummary,
        confidence: parsed.confidence,
        evidence: parsed.evidence,
        relatedMemoryIds: promoted.map((memory) => memory.id),
        createdAt: at,
      }),
    );
    await this.recordLearning(
      input.ownerId,
      parsed.agentId,
      parsed.workflowId ?? null,
      "reflect",
      "Reflection converted completed work into evidence-backed lessons.",
      parsed.evidence,
      at,
    );
    await this.updateState(
      input.ownerId,
      parsed.agentId,
      "reflecting",
      parsed.workflowId ?? null,
      null,
      "Reflection recorded.",
      at,
    );
    await this.audit({
      eventType: "AGENT_REFLECTION_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent reflection recorded.",
      requestId: input.requestId,
      metadata: { agentId: parsed.agentId, reflectionId: reflection.id },
    });
    return { reflection };
  }

  async reason(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = CreateReasoningRequestSchema.parse(input.body);
    await this.requireAgent(input.ownerId, parsed.agentId);
    const at = this.now().toISOString();
    const prioritizedContext = await this.prioritizeContext(
      input.ownerId,
      parsed.agentId,
      parsed.goal,
    );
    const confidenceValue = Math.max(
      0.35,
      Math.min(0.92, 0.55 + prioritizedContext.prioritizedMemoryIds.length * 0.03),
    );
    const lowConfidenceAction = confidenceValue < 0.6 ? "additional_retrieval" : "none";
    const decision = AgentDecisionLogRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      decision: `Reasoning result for ${parsed.mode}`,
      reasoning: `Goal: ${parsed.goal}. Constraints considered: ${
        parsed.constraints.join("; ") || "none supplied"
      }. Context was prioritized by relevance, recency, importance, and confidence.`,
      alternatives: [
        "Use only current task context",
        "Retrieve all available memory",
        "Use bounded prioritized context",
      ],
      outcome: "Bounded prioritized context selected. Recommendation remains advisory.",
      approvalHistory: [],
      dependencies: parsed.constraints,
      futureImplications:
        "Future implementation still requires normal workflow planning, approval, validation, and audit controls.",
      evidence: parsed.evidence,
      confidence: confidenceValue,
      createdAt: at,
      updatedAt: at,
    });
    const confidence = ConfidenceRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      targetType: parsed.mode.includes("architecture") ? "architecture" : "reasoning",
      targetRef: decision.id,
      confidence: confidenceValue,
      basis:
        "Confidence is derived from evidence count, prioritized memory availability, and bounded context quality.",
      lowConfidenceAction,
      evidence: parsed.evidence,
      createdAt: at,
    });
    await this.store.saveDecision(decision);
    await this.store.saveConfidence(confidence);
    await this.saveCognitiveMemory({
      ownerId: input.ownerId,
      agentId: parsed.agentId,
      workflowId: parsed.workflowId ?? null,
      kind: "working",
      title: parsed.goal,
      summary: decision.reasoning,
      content: decision.futureImplications,
      tags: ["working-memory", parsed.mode],
      importance: 70,
      confidence: confidenceValue,
      evidence: parsed.evidence,
      validationStatus: "unverified",
      expiresAt: new Date(this.now().getTime() + 86_400_000).toISOString(),
      at,
    });
    await this.updateState(
      input.ownerId,
      parsed.agentId,
      "reasoning",
      parsed.workflowId ?? null,
      null,
      parsed.goal,
      at,
    );
    await this.audit({
      eventType: "AGENT_REASONING_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent reasoning recorded.",
      requestId: input.requestId,
      metadata: { agentId: parsed.agentId, decisionId: decision.id },
    });
    return ReasoningResponseSchema.parse({ decision, confidence, prioritizedContext });
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    await this.agentOs.ensureBaseline(ownerId, requestId);
    const at = this.now().toISOString();
    for (const agent of await this.agentStore.listAgents(ownerId)) {
      await this.ensureAgentBaseline(ownerId, agent, at);
    }
  }

  private async ensureAgentBaseline(ownerId: string, agent: AgentRecord, at: string) {
    const existingStates = await this.store.listStates(ownerId);
    if (!existingStates.some((state) => state.agentId === agent.id)) {
      await this.updateState(
        ownerId,
        agent.id,
        "idle",
        null,
        null,
        "Agent cognition initialized.",
        at,
      );
    }
    const existingSpecializations = await this.store.listSpecializations(ownerId);
    if (!existingSpecializations.some((profile) => profile.agentId === agent.id)) {
      await this.store.saveSpecialization(
        SpecializationProfileRecordSchema.parse({
          ownerId,
          agentId: agent.id,
          domains: agent.capabilities.map(normalize),
          frameworks: [],
          languages: [],
          libraries: [],
          architectures: agent.supportedTasks.map(normalize).slice(0, 20),
          businessAreas: [],
          performanceScore: 0.75,
          confidence: 0.75,
          preferredWorkflows: agent.supportedTasks.slice(0, 20),
          expertiseGrowth: 0,
          updatedAt: at,
        }),
      );
    }
    const existingMetrics = await this.store.listMetrics(ownerId);
    if (!existingMetrics.some((metrics) => metrics.agentId === agent.id)) {
      await this.store.saveMetrics(
        CognitiveMetricsRecordSchema.parse({
          ownerId,
          agentId: agent.id,
          memoryRetrievalAccuracy: 0.7,
          planningQuality: 0.7,
          reasoningConfidence: 0.7,
          reflectionQuality: 0.7,
          lessonReuse: 0,
          experienceGrowth: 0,
          knowledgeUtilization: 0.7,
          decisionConsistency: 0.7,
          specializationGrowth: 0,
          hallucinationReduction: 0.7,
          recordedAt: at,
        }),
      );
    }
    const semantic = await this.store.searchMemory(ownerId, {
      q: agent.id,
      agentId: agent.id,
      kind: "semantic",
      limit: 1,
    });
    if (semantic.length === 0) {
      await this.saveCognitiveMemory({
        ownerId,
        agentId: agent.id,
        workflowId: null,
        kind: "semantic",
        title: `${agent.displayName} specialization`,
        summary: `${agent.displayName} specializes in ${agent.capabilities.join(", ")}.`,
        content: agent.healthSummary,
        tags: ["agent", "specialization", agent.role],
        importance: 70,
        confidence: 0.8,
        evidence: defaultEvidence(at, agent.id),
        validationStatus: "agent_validated",
        at,
      });
    }
    const procedural = await this.store.searchMemory(ownerId, {
      q: agent.id,
      agentId: agent.id,
      kind: "procedural",
      limit: 1,
    });
    if (procedural.length === 0) {
      await this.saveCognitiveMemory({
        ownerId,
        agentId: agent.id,
        workflowId: null,
        kind: "procedural",
        title: `${agent.displayName} default procedure`,
        summary:
          "Retrieve relevant context, reason with evidence, request review when confidence is low, and never bypass approval.",
        content: agent.supportedTasks.join("; "),
        tags: ["procedure", "approval-gated", agent.role],
        importance: 75,
        confidence: 0.8,
        evidence: defaultEvidence(at, agent.id),
        validationStatus: "agent_validated",
        at,
      });
    }
  }

  private async saveCognitiveMemory(input: {
    ownerId: string;
    agentId: string;
    workflowId: string | null;
    kind: CognitiveMemoryRecord["kind"];
    title: string;
    summary: string;
    content: string;
    tags: string[];
    importance: number;
    confidence: number;
    evidence: MemoryEvidence[];
    validationStatus: CognitiveMemoryRecord["validationStatus"];
    promotedFromWorkingMemoryId?: string | null;
    expiresAt?: string | null;
    at: string;
  }) {
    const memory = CognitiveMemoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: input.agentId,
      workflowId: input.workflowId,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      content: input.content,
      tags: input.tags,
      importance: input.importance,
      confidence: input.confidence,
      evidence: input.evidence,
      validationStatus: input.validationStatus,
      promotedFromWorkingMemoryId: input.promotedFromWorkingMemoryId ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: input.at,
      updatedAt: input.at,
      lastAccessedAt: null,
    });
    await this.store.saveMemory(memory);
    return memory;
  }

  private async prioritizeContext(ownerId: string, agentId: string, goal: string) {
    const memories = await this.store.searchMemory(ownerId, {
      q: goal,
      agentId,
      limit: 12,
    });
    const decisions = await this.memoryStore.listDecisions(ownerId, 12);
    return ContextPrioritizationResultSchema.parse({
      agentId,
      prioritizedMemoryIds: memories.map((memory) => memory.id),
      prioritizedDecisionIds: decisions.map((decision) => decision.id),
      factors: ["relevance", "recency", "importance", "confidence", "agent scope"],
      confidence: memories.length > 0 ? 0.78 : 0.45,
    });
  }

  private async updateState(
    ownerId: string,
    agentId: string,
    state: "idle" | "reflecting" | "reasoning",
    workflowId: string | null,
    goalId: string | null,
    reason: string,
    at: string,
  ) {
    await this.store.saveState(
      CognitiveStateRecordSchema.parse({
        ownerId,
        agentId,
        state,
        activeWorkflowId: workflowId,
        activeGoalId: goalId,
        reasoningMode: state === "reasoning" ? "decision_justification" : null,
        focusSummary: reason,
        lastTransitionAt: at,
        transitionReason: reason,
      }),
    );
  }

  private async recordLearning(
    ownerId: string,
    agentId: string,
    workflowId: string | null,
    stage: "reflect" | "update_semantic" | "update_procedural",
    summary: string,
    evidence: MemoryEvidence[],
    at: string,
  ) {
    await this.store.saveLearningEvent(
      LearningPipelineEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        agentId,
        workflowId,
        stage,
        summary,
        evidence,
        createdAt: at,
      }),
    );
  }

  async consolidate(
    ownerId: string,
    agentId: string,
    requestId: string,
    ipAddress: string,
  ) {
    await this.ensureBaseline(ownerId, requestId);
    await this.requireAgent(ownerId, agentId);
    const at = this.now().toISOString();
    const semantic = await this.store.searchMemory(ownerId, {
      q: "",
      agentId,
      kind: "semantic",
      limit: 50,
    });
    const consolidation = MemoryConsolidationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      agentId,
      status: "completed",
      mergedMemoryIds: semantic.map((memory) => memory.id).slice(0, 50),
      summary:
        "Consolidation summarized related semantic memories while preserving all originals.",
      preservedOriginals: true,
      createdAt: at,
      completedAt: at,
    });
    await this.store.saveConsolidation(consolidation);
    await this.recordLearning(
      ownerId,
      agentId,
      null,
      "update_semantic",
      consolidation.summary,
      defaultEvidence(at, agentId),
      at,
    );
    await this.audit({
      eventType: "AGENT_MEMORY_CONSOLIDATED",
      ownerId,
      ipAddress,
      outcome: "SUCCESS",
      reason: "Agent cognitive memory consolidated.",
      requestId,
      metadata: { agentId, consolidationId: consolidation.id },
    });
    return consolidation;
  }

  private async requireAgent(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    return agent;
  }
}
