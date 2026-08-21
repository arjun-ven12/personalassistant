import { z } from "zod";

import { MemoryEvidenceSchema } from "./memory.js";

export const CognitiveStateSchema = z.enum([
  "idle",
  "observing",
  "planning",
  "reasoning",
  "researching",
  "implementing",
  "reviewing",
  "reflecting",
  "learning",
  "waiting",
  "completed",
  "archived",
]);

export const CognitiveMemoryKindSchema = z.enum([
  "working",
  "episodic",
  "semantic",
  "procedural",
]);

export const MemoryValidationStatusSchema = z.enum([
  "unverified",
  "agent_validated",
  "reviewed",
  "superseded",
]);

export const CognitiveRelationshipSchema = z.enum([
  "derived_from",
  "related_to",
  "supersedes",
  "depends_on",
  "contradicts",
  "validated_by",
  "referenced_by",
  "supports",
]);

export const ReasoningModeSchema = z.enum([
  "goal_decomposition",
  "alternative_generation",
  "tradeoff_analysis",
  "risk_assessment",
  "constraint_evaluation",
  "dependency_reasoning",
  "cost_benefit",
  "architecture_reasoning",
  "failure_prediction",
  "decision_justification",
]);

export const CognitiveMemoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    kind: CognitiveMemoryKindSchema,
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    content: z.string().max(10_000),
    tags: z.array(z.string().min(1).max(80)).max(50),
    importance: z.number().int().min(0).max(100),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    validationStatus: MemoryValidationStatusSchema,
    promotedFromWorkingMemoryId: z.string().uuid().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastAccessedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const MemoryRelationshipRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    sourceMemoryId: z.string().uuid(),
    targetMemoryId: z.string().uuid(),
    relationship: CognitiveRelationshipSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ExperienceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    outcome: z.enum(["success", "failure", "partial", "cancelled"]),
    impact: z.enum(["low", "medium", "high"]),
    context: z.string().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    relatedMemoryIds: z.array(z.string().uuid()).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentDecisionLogRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    decision: z.string().min(1).max(1_000),
    reasoning: z.string().min(1).max(3_000),
    alternatives: z.array(z.string().min(1).max(1_000)).max(20),
    outcome: z.string().max(1_000).nullable(),
    approvalHistory: z.array(z.string().min(1).max(500)).max(50),
    dependencies: z.array(z.string().min(1).max(500)).max(50),
    futureImplications: z.string().max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SpecializationProfileRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    domains: z.array(z.string().min(1).max(120)).max(100),
    frameworks: z.array(z.string().min(1).max(120)).max(100),
    languages: z.array(z.string().min(1).max(120)).max(100),
    libraries: z.array(z.string().min(1).max(120)).max(100),
    architectures: z.array(z.string().min(1).max(120)).max(100),
    businessAreas: z.array(z.string().min(1).max(120)).max(100),
    performanceScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    preferredWorkflows: z.array(z.string().min(1).max(500)).max(50),
    expertiseGrowth: z.number().min(0).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ReflectionReportRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    objectives: z.array(z.string().min(1).max(500)).max(50),
    qualitySummary: z.string().min(1).max(2_000),
    mistakes: z.array(z.string().min(1).max(1_000)).max(50),
    missedOpportunities: z.array(z.string().min(1).max(1_000)).max(50),
    unexpectedOutcomes: z.array(z.string().min(1).max(1_000)).max(50),
    lessonsLearned: z.array(z.string().min(1).max(1_000)).max(50),
    reusablePatterns: z.array(z.string().min(1).max(1_000)).max(50),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ConfidenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    targetType: z.enum([
      "knowledge",
      "reasoning",
      "code_generation",
      "architecture",
      "planning",
      "testing",
      "recommendation",
    ]),
    targetRef: z.string().min(1).max(255),
    confidence: z.number().min(0).max(1),
    basis: z.string().min(1).max(2_000),
    lowConfidenceAction: z.enum([
      "none",
      "additional_retrieval",
      "cross_agent_review",
      "clarification",
      "human_approval",
    ]),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const GoalTrackingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    currentObjective: z.string().min(1).max(1_000),
    subgoals: z.array(z.string().min(1).max(500)).max(100),
    completedSubgoals: z.array(z.string().min(1).max(500)).max(100),
    blockedTasks: z.array(z.string().min(1).max(500)).max(100),
    dependencies: z.array(z.string().min(1).max(500)).max(100),
    progressPercent: z.number().min(0).max(100),
    status: z.enum(["active", "blocked", "completed", "archived"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CognitiveStateRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    state: CognitiveStateSchema,
    activeWorkflowId: z.string().uuid().nullable(),
    activeGoalId: z.string().uuid().nullable(),
    reasoningMode: ReasoningModeSchema.nullable(),
    focusSummary: z.string().max(1_000),
    lastTransitionAt: z.iso.datetime(),
    transitionReason: z.string().min(1).max(1_000),
  })
  .strict();

export const CognitiveMetricsRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    memoryRetrievalAccuracy: z.number().min(0).max(1),
    planningQuality: z.number().min(0).max(1),
    reasoningConfidence: z.number().min(0).max(1),
    reflectionQuality: z.number().min(0).max(1),
    lessonReuse: z.number().min(0).max(1),
    experienceGrowth: z.number().min(0).max(1),
    knowledgeUtilization: z.number().min(0).max(1),
    decisionConsistency: z.number().min(0).max(1),
    specializationGrowth: z.number().min(0).max(1),
    hallucinationReduction: z.number().min(0).max(1),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const LearningPipelineEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    stage: z.enum([
      "capture",
      "reflect",
      "validate",
      "extract_lessons",
      "update_procedural",
      "update_semantic",
      "update_specialization",
      "summarize",
      "schedule_consolidation",
    ]),
    summary: z.string().min(1).max(1_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const MemoryConsolidationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    status: z.enum(["scheduled", "completed", "failed"]),
    mergedMemoryIds: z.array(z.string().uuid()).max(500),
    summary: z.string().min(1).max(2_000),
    preservedOriginals: z.literal(true),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const ContextPrioritizationResultSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    prioritizedMemoryIds: z.array(z.string().uuid()).max(100),
    prioritizedDecisionIds: z.array(z.string().uuid()).max(100),
    factors: z.array(z.string().min(1).max(500)).max(50),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const CognitiveDashboardResponseSchema = z
  .object({
    workingMemory: z.array(CognitiveMemoryRecordSchema).max(100),
    episodicMemory: z.array(CognitiveMemoryRecordSchema).max(100),
    semanticMemory: z.array(CognitiveMemoryRecordSchema).max(100),
    proceduralMemory: z.array(CognitiveMemoryRecordSchema).max(100),
    relationships: z.array(MemoryRelationshipRecordSchema).max(500),
    experiences: z.array(ExperienceRecordSchema).max(100),
    decisions: z.array(AgentDecisionLogRecordSchema).max(100),
    specializations: z.array(SpecializationProfileRecordSchema).max(200),
    reflections: z.array(ReflectionReportRecordSchema).max(100),
    confidenceHistory: z.array(ConfidenceRecordSchema).max(200),
    goals: z.array(GoalTrackingRecordSchema).max(100),
    states: z.array(CognitiveStateRecordSchema).max(200),
    learningEvents: z.array(LearningPipelineEventRecordSchema).max(200),
    consolidations: z.array(MemoryConsolidationRecordSchema).max(100),
    metrics: z.array(CognitiveMetricsRecordSchema).max(200),
    contextPrioritization: z.array(ContextPrioritizationResultSchema).max(50),
    advisoryOnly: z.literal(true),
  })
  .strict();

export const CreateReflectionRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().optional(),
    objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
    qualitySummary: z.string().trim().min(1).max(2_000),
    mistakes: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
    missedOpportunities: z
      .array(z.string().trim().min(1).max(1_000))
      .max(50)
      .default([]),
    unexpectedOutcomes: z
      .array(z.string().trim().min(1).max(1_000))
      .max(50)
      .default([]),
    lessonsLearned: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
    reusablePatterns: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
    confidence: z.number().min(0).max(1).default(0.75),
    evidence: z.array(MemoryEvidenceSchema).max(100).default([]),
  })
  .strict();

export const CreateReasoningRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().optional(),
    mode: ReasoningModeSchema,
    goal: z.string().trim().min(1).max(1_000),
    constraints: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
    evidence: z.array(MemoryEvidenceSchema).max(100).default([]),
  })
  .strict();

export const CognitiveSearchQuerySchema = z
  .object({
    q: z.string().trim().max(255).default(""),
    agentId: z.string().min(3).max(120).optional(),
    kind: CognitiveMemoryKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const CognitiveSearchResponseSchema = z
  .object({
    query: CognitiveSearchQuerySchema,
    memories: z.array(CognitiveMemoryRecordSchema).max(100),
  })
  .strict();

export const ReflectionResponseSchema = z
  .object({ reflection: ReflectionReportRecordSchema })
  .strict();

export const ReasoningResponseSchema = z
  .object({
    decision: AgentDecisionLogRecordSchema,
    confidence: ConfidenceRecordSchema,
    prioritizedContext: ContextPrioritizationResultSchema,
  })
  .strict();

export type CognitiveMemoryRecord = z.infer<typeof CognitiveMemoryRecordSchema>;
export type MemoryRelationshipRecord = z.infer<typeof MemoryRelationshipRecordSchema>;
export type ExperienceRecord = z.infer<typeof ExperienceRecordSchema>;
export type AgentDecisionLogRecord = z.infer<typeof AgentDecisionLogRecordSchema>;
export type SpecializationProfileRecord = z.infer<
  typeof SpecializationProfileRecordSchema
>;
export type ReflectionReportRecord = z.infer<typeof ReflectionReportRecordSchema>;
export type ConfidenceRecord = z.infer<typeof ConfidenceRecordSchema>;
export type GoalTrackingRecord = z.infer<typeof GoalTrackingRecordSchema>;
export type CognitiveStateRecord = z.infer<typeof CognitiveStateRecordSchema>;
export type CognitiveMetricsRecord = z.infer<typeof CognitiveMetricsRecordSchema>;
export type LearningPipelineEventRecord = z.infer<
  typeof LearningPipelineEventRecordSchema
>;
export type MemoryConsolidationRecord = z.infer<typeof MemoryConsolidationRecordSchema>;
export type ContextPrioritizationResult = z.infer<
  typeof ContextPrioritizationResultSchema
>;
export type CognitiveDashboardResponse = z.infer<
  typeof CognitiveDashboardResponseSchema
>;
export type CreateReflectionRequest = z.infer<typeof CreateReflectionRequestSchema>;
export type CreateReasoningRequest = z.infer<typeof CreateReasoningRequestSchema>;
export type CognitiveSearchQuery = z.infer<typeof CognitiveSearchQuerySchema>;
