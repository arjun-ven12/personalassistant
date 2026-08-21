import { z } from "zod";

export const MemoryTypeSchema = z.enum([
  "episodic",
  "semantic",
  "procedural",
  "preference",
  "repository",
  "agent",
]);

export const MemorySourceSchema = z.enum([
  "owner",
  "system",
  "agent",
  "workflow",
  "repository",
  "validation",
  "integration",
  "conversation",
]);

export const KnowledgeNodeKindSchema = z.enum([
  "repository",
  "symbol",
  "agent",
  "workflow",
  "task",
  "integration",
  "decision",
  "preference",
  "architecture",
  "documentation",
  "memory",
]);

export const KnowledgeEdgeRelationSchema = z.enum([
  "mentions",
  "depends_on",
  "implements",
  "decided_by",
  "owned_by",
  "similar_to",
  "conflicts_with",
  "validated_by",
  "derived_from",
  "documents",
]);

export const EngineeringDecisionStatusSchema = z.enum([
  "active",
  "superseded",
  "rejected",
]);

export const LearningEventKindSchema = z.enum([
  "pattern_observed",
  "workflow_outcome",
  "review_feedback",
  "validation_outcome",
  "preference_observed",
  "suggestion_feedback",
]);

export const MemorySuggestionStatusSchema = z.enum([
  "open",
  "accepted",
  "dismissed",
  "superseded",
]);

export const MemoryEvidenceSchema = z
  .object({
    sourceType: z.enum([
      "file",
      "symbol",
      "repository",
      "workflow",
      "agent",
      "validation",
      "audit",
      "conversation",
      "manual",
    ]),
    reference: z.string().min(1).max(500),
    excerpt: z.string().max(1_000).nullable().default(null),
    observedAt: z.iso.datetime(),
  })
  .strict();

export const MemoryRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    agentId: z.string().min(3).max(120).nullable(),
    workflowId: z.string().uuid().nullable(),
    memoryType: MemoryTypeSchema,
    source: MemorySourceSchema,
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    content: z.string().max(10_000),
    tags: z.array(z.string().min(1).max(80)).max(50),
    importance: z.number().int().min(0).max(100),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastAccessedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();

export const KnowledgeNodeSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    kind: KnowledgeNodeKindSchema,
    label: z.string().min(1).max(255),
    refId: z.string().min(1).max(255).nullable(),
    summary: z.string().max(2_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeEdgeSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sourceNodeId: z.string().uuid(),
    targetNodeId: z.string().uuid(),
    relation: KnowledgeEdgeRelationSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringDecisionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    workflowId: z.string().uuid().nullable(),
    decision: z.string().min(1).max(1_000),
    reason: z.string().min(1).max(3_000),
    alternatives: z.array(z.string().min(1).max(1_000)).max(20),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    approver: z.string().min(1).max(255),
    status: EngineeringDecisionStatusSchema,
    supersedesDecisionId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RepositoryMemoryRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    architectureSummary: z.string().max(5_000),
    commonFiles: z.array(z.string().min(1).max(500)).max(200),
    knownIssues: z.array(z.string().min(1).max(1_000)).max(100),
    technicalDebt: z.array(z.string().min(1).max(1_000)).max(100),
    lastConsolidatedAt: z.iso.datetime(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const AgentMemoryRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    expertise: z.array(z.string().min(1).max(120)).max(50),
    successRate: z.number().min(0).max(1),
    commonMistakes: z.array(z.string().min(1).max(500)).max(50),
    preferredReasoningPaths: z.array(z.string().min(1).max(500)).max(50),
    lastUpdatedAt: z.iso.datetime(),
  })
  .strict();

export const LearningEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    agentId: z.string().min(3).max(120).nullable(),
    workflowId: z.string().uuid().nullable(),
    kind: LearningEventKindSchema,
    summary: z.string().min(1).max(1_000),
    confidenceDelta: z.number().min(-1).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const MemorySuggestionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    title: z.string().min(1).max(255),
    rationale: z.string().min(1).max(2_000),
    suggestedAction: z.string().min(1).max(1_000),
    riskLevel: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    status: MemorySuggestionStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const MemoryTimelineEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    occurredAt: z.iso.datetime(),
    eventType: z.string().min(1).max(120),
    title: z.string().min(1).max(255),
    summary: z.string().max(2_000),
    linkedMemoryIds: z.array(z.string().uuid()).max(50),
    linkedDecisionIds: z.array(z.string().uuid()).max(50),
  })
  .strict();

export const CreateMemoryRequestSchema = z
  .object({
    repositoryId: z.string().uuid().optional(),
    agentId: z.string().min(3).max(120).optional(),
    workflowId: z.string().uuid().optional(),
    memoryType: MemoryTypeSchema,
    source: MemorySourceSchema.default("owner"),
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().min(1).max(2_000),
    content: z.string().trim().max(10_000).default(""),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    importance: z.number().int().min(0).max(100).default(50),
    confidence: z.number().min(0).max(1).default(0.75),
    evidence: z.array(MemoryEvidenceSchema).max(100).default([]),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export const CreateDecisionRequestSchema = z
  .object({
    repositoryId: z.string().uuid().optional(),
    workflowId: z.string().uuid().optional(),
    decision: z.string().trim().min(1).max(1_000),
    reason: z.string().trim().min(1).max(3_000),
    alternatives: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
    evidence: z.array(MemoryEvidenceSchema).max(100).default([]),
    supersedesDecisionId: z.string().uuid().optional(),
  })
  .strict();

export const MemorySearchQuerySchema = z
  .object({
    q: z.string().trim().max(255).default(""),
    type: MemoryTypeSchema.optional(),
    repositoryId: z.string().uuid().optional(),
    agentId: z.string().min(3).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const MemoryStatisticsSchema = z
  .object({
    totalMemories: z.number().int().nonnegative(),
    memoryCountByType: z.record(MemoryTypeSchema, z.number().int().nonnegative()),
    decisionCount: z.number().int().nonnegative(),
    knowledgeNodeCount: z.number().int().nonnegative(),
    knowledgeEdgeCount: z.number().int().nonnegative(),
    openSuggestionCount: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
  })
  .strict();

export const MemoryCenterResponseSchema = z
  .object({
    statistics: MemoryStatisticsSchema,
    recentMemories: z.array(MemoryRecordSchema).max(50),
    decisions: z.array(EngineeringDecisionRecordSchema).max(50),
    suggestions: z.array(MemorySuggestionRecordSchema).max(50),
    timeline: z.array(MemoryTimelineEventSchema).max(100),
    graph: z
      .object({
        nodes: z.array(KnowledgeNodeSchema).max(500),
        edges: z.array(KnowledgeEdgeSchema).max(1_000),
      })
      .strict(),
  })
  .strict();

export const MemorySearchResponseSchema = z
  .object({
    query: MemorySearchQuerySchema,
    memories: z.array(MemoryRecordSchema).max(100),
  })
  .strict();

export const KnowledgeGraphResponseSchema = z
  .object({
    nodes: z.array(KnowledgeNodeSchema).max(1_000),
    edges: z.array(KnowledgeEdgeSchema).max(2_000),
  })
  .strict();

export const EngineeringDecisionListResponseSchema = z
  .array(EngineeringDecisionRecordSchema)
  .max(200);
export const EngineeringDecisionResponseSchema = z
  .object({ decision: EngineeringDecisionRecordSchema })
  .strict();
export const RepositoryMemoryResponseSchema = RepositoryMemoryRecordSchema.nullable();
export const AgentMemoryResponseSchema = AgentMemoryRecordSchema.nullable();
export const MemoryTimelineResponseSchema = z.array(MemoryTimelineEventSchema).max(500);
export const MemorySuggestionListResponseSchema = z
  .array(MemorySuggestionRecordSchema)
  .max(200);
export const MemoryRecordResponseSchema = z
  .object({ memory: MemoryRecordSchema })
  .strict();

export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type MemorySource = z.infer<typeof MemorySourceSchema>;
export type MemoryEvidence = z.infer<typeof MemoryEvidenceSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;
export type KnowledgeEdge = z.infer<typeof KnowledgeEdgeSchema>;
export type EngineeringDecisionRecord = z.infer<typeof EngineeringDecisionRecordSchema>;
export type RepositoryMemoryRecord = z.infer<typeof RepositoryMemoryRecordSchema>;
export type AgentMemoryRecord = z.infer<typeof AgentMemoryRecordSchema>;
export type LearningEventRecord = z.infer<typeof LearningEventRecordSchema>;
export type MemorySuggestionRecord = z.infer<typeof MemorySuggestionRecordSchema>;
export type MemoryTimelineEvent = z.infer<typeof MemoryTimelineEventSchema>;
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;
export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;
export type MemoryCenterResponse = z.infer<typeof MemoryCenterResponseSchema>;
