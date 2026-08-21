import { z } from "zod";

export const CognitiveItemTypeSchema = z.enum([
  "MEMORY",
  "KNOWLEDGE_ENTITY",
  "KNOWLEDGE_RELATIONSHIP",
  "KNOWLEDGE_FACT",
  "DECISION",
  "GOAL",
  "LEARNED_PREFERENCE",
  "LEARNING_CANDIDATE",
  "HABIT",
  "SEQUENCE_PATTERN",
  "CORRECTION",
  "ALIAS",
  "VOCABULARY_ENTRY",
  "PERSONALITY_TRAIT",
  "PERSONALITY_RULE",
  "SEMANTIC_EXAMPLE",
  "CONVERSATION_MEMORY",
  "WORKFLOW_MEMORY",
  "PROJECT_MEMORY",
  "AGENT_MEMORY",
  "EMBEDDING_REFERENCE",
]);

export const RetentionClassSchema = z.enum([
  "TRANSIENT",
  "SHORT_TERM",
  "WORKING",
  "DURABLE",
  "PINNED",
  "HISTORICAL",
  "SYSTEM",
]);

export const CognitiveSensitivityClassSchema = z.enum([
  "NORMAL",
  "PRIVATE",
  "RESTRICTED",
  "SYSTEM",
]);

export const CognitiveItemStatusSchema = z.enum([
  "active",
  "candidate",
  "suggested",
  "approved",
  "locked",
  "archived",
  "superseded",
  "rejected",
  "expired",
  "open",
  "resolved",
  "accepted",
  "dismissed",
  "observing",
  "unknown",
]);

export const CognitiveProvenanceSchema = z
  .object({
    sourceType: z.string().min(1).max(120),
    sourceId: z.string().min(1).max(500).nullable(),
    sourceUri: z.string().max(1_000).nullable(),
    excerpt: z.string().max(1_000).nullable(),
    observedAt: z.iso.datetime().nullable(),
    ownerConfirmed: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const CognitiveItemSchema = z
  .object({
    id: z.string().min(1).max(300),
    sourceId: z.string().min(1).max(255),
    itemType: CognitiveItemTypeSchema,
    title: z.string().min(1).max(255),
    summary: z.string().max(2_000),
    ownerId: z.string().uuid(),
    confidence: z.number().min(0).max(1),
    status: CognitiveItemStatusSchema,
    source: z.string().min(1).max(120),
    provenance: z.array(CognitiveProvenanceSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
    lastObservedAt: z.iso.datetime().nullable(),
    usageCount: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    tags: z.array(z.string().min(1).max(80)).max(50),
    archived: z.boolean(),
    pinned: z.boolean(),
    editable: z.boolean(),
    deletable: z.boolean(),
    mergeable: z.boolean(),
    retentionClass: RetentionClassSchema,
    sensitivityClass: CognitiveSensitivityClassSchema,
    embeddingAvailable: z.boolean(),
    ownerConfirmed: z.boolean(),
    automaticallyLearned: z.boolean(),
    manual: z.boolean(),
    lowConfidence: z.boolean(),
    stale: z.boolean(),
    conflict: z.boolean(),
    rawPreview: z.record(z.string(), z.unknown()),
  })
  .strict();

export const MemoryStudioSearchQuerySchema = z
  .object({
    q: z.string().trim().max(255).default(""),
    itemType: CognitiveItemTypeSchema.optional(),
    source: z.string().trim().max(120).optional(),
    projectId: z.string().trim().max(255).optional(),
    agentId: z.string().trim().max(255).optional(),
    applicationId: z.string().trim().max(255).optional(),
    workflowId: z.string().trim().max(255).optional(),
    status: CognitiveItemStatusSchema.optional(),
    confidenceMax: z.coerce.number().min(0).max(1).optional(),
    confidenceMin: z.coerce.number().min(0).max(1).optional(),
    pinned: z.coerce.boolean().optional(),
    archived: z.coerce.boolean().optional(),
    lowConfidence: z.coerce.boolean().optional(),
    stale: z.coerce.boolean().optional(),
    conflict: z.coerce.boolean().optional(),
    embeddingAvailable: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const CognitiveOverviewSchema = z
  .object({
    totalItems: z.number().int().nonnegative(),
    memories: z.number().int().nonnegative(),
    knowledgeEntities: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
    facts: z.number().int().nonnegative(),
    learnedPreferences: z.number().int().nonnegative(),
    learningCandidates: z.number().int().nonnegative(),
    habits: z.number().int().nonnegative(),
    sequencePatterns: z.number().int().nonnegative(),
    corrections: z.number().int().nonnegative(),
    semanticExamples: z.number().int().nonnegative(),
    embeddings: z.number().int().nonnegative(),
    archivedItems: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    lowConfidenceItems: z.number().int().nonnegative(),
    staleItems: z.number().int().nonnegative(),
    pinnedItems: z.number().int().nonnegative(),
    recentlyCreated: z.number().int().nonnegative(),
    recentlyUsed: z.number().int().nonnegative(),
    recentlyChanged: z.number().int().nonnegative(),
  })
  .strict();

export const CognitiveHealthMetricSchema = z
  .object({
    key: z.string().min(1).max(120),
    label: z.string().min(1).max(160),
    value: z.number().min(0).max(1),
    count: z.number().int().nonnegative(),
    status: z.enum(["healthy", "watch", "review"]),
    explanation: z.string().min(1).max(1_000),
  })
  .strict();

export const EmbeddingInspectionSchema = z
  .object({
    itemId: z.string().min(1).max(300),
    itemType: CognitiveItemTypeSchema,
    title: z.string().min(1).max(255),
    embeddingReference: z.string().min(1).max(500).nullable(),
    embeddingProvider: z.string().min(1).max(120),
    modelName: z.string().min(1).max(160),
    modelVersion: z.string().min(1).max(80),
    dimension: z.number().int().positive(),
    indexNamespace: z.string().min(1).max(120),
    sourceTextSummary: z.string().max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rawVectorVisible: z.literal(false),
  })
  .strict();

export const CognitiveExplanationSchema = z
  .object({
    item: CognitiveItemSchema,
    whyRemembered: z.string().min(1).max(2_000),
    howUsed: z.array(z.string().min(1).max(200)).max(20),
    usageTrace: z.array(z.string().min(1).max(300)).max(50),
    confidenceSignals: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
    relatedItemIds: z.array(z.string().min(1).max(300)).max(100),
    provenance: z.array(CognitiveProvenanceSchema).max(100),
    hiddenReasoningExposed: z.literal(false),
  })
  .strict();

export const CognitiveActionImpactSchema = z
  .object({
    item: CognitiveItemSchema,
    action: z.enum([
      "archive",
      "restore",
      "pin",
      "unpin",
      "delete",
      "merge",
      "split",
      "reindex",
    ]),
    allowed: z.boolean(),
    requiresApproval: z.boolean(),
    destructive: z.boolean(),
    affectedItemIds: z.array(z.string().min(1).max(300)).max(200),
    explanation: z.string().min(1).max(2_000),
  })
  .strict();

export const CognitiveContextPreviewSchema = z
  .object({
    input: z.string().min(1).max(1_000),
    resolvedItems: z.array(CognitiveItemSchema).max(25),
    included: z.array(CognitiveItemSchema).max(25),
    excludedCount: z.number().int().nonnegative(),
    confidenceThreshold: z.number().min(0).max(1),
    graphDepth: z.number().int().min(0).max(3),
    explanation: z.string().min(1).max(2_000),
    llmRequired: z.literal(false),
  })
  .strict();

export const MemoryStudioDashboardSchema = z
  .object({
    overview: CognitiveOverviewSchema,
    items: z.array(CognitiveItemSchema).max(100),
    lowConfidence: z.array(CognitiveItemSchema).max(100),
    stale: z.array(CognitiveItemSchema).max(100),
    conflicts: z.array(CognitiveItemSchema).max(100),
    embeddings: z.array(EmbeddingInspectionSchema).max(100),
    health: z.array(CognitiveHealthMetricSchema).max(50),
    privateModeAvailable: z.literal(true),
    llmRequired: z.literal(false),
    deletionPolicy: z.literal("impact_preview_required"),
  })
  .strict();

export const MemoryStudioSearchResponseSchema = z
  .object({
    query: MemoryStudioSearchQuerySchema,
    items: z.array(CognitiveItemSchema).max(100),
    total: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative().nullable(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

export const UpdateCognitiveItemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    summary: z.string().trim().max(2_000).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    confidence: z.number().min(0).max(1).optional(),
    retentionClass: RetentionClassSchema.optional(),
    reason: z.string().trim().max(1_000).optional(),
  })
  .strict();

export const CognitiveMergeRequestSchema = z
  .object({
    primaryItemId: z.string().min(1).max(300),
    duplicateItemIds: z.array(z.string().min(1).max(300)).min(1).max(20),
    reason: z.string().trim().min(1).max(1_000),
    previewOnly: z.boolean().default(true),
  })
  .strict();

export const CognitiveContextPreviewRequestSchema = z
  .object({
    input: z.string().trim().min(1).max(1_000),
    confidenceThreshold: z.number().min(0).max(1).default(0.45),
    graphDepth: z.number().int().min(0).max(3).default(1),
    limit: z.number().int().min(1).max(25).default(12),
  })
  .strict();

export const CognitiveExportResponseSchema = z
  .object({
    exportedAt: z.iso.datetime(),
    scope: z.string().min(1).max(120),
    itemCount: z.number().int().nonnegative(),
    items: z.array(CognitiveItemSchema).max(1_000),
    rawSecretsExported: z.literal(false),
    rawVectorsExported: z.literal(false),
  })
  .strict();

export type CognitiveItemType = z.infer<typeof CognitiveItemTypeSchema>;
export type RetentionClass = z.infer<typeof RetentionClassSchema>;
export type CognitiveProvenance = z.infer<typeof CognitiveProvenanceSchema>;
export type CognitiveItem = z.infer<typeof CognitiveItemSchema>;
export type MemoryStudioSearchQuery = z.infer<typeof MemoryStudioSearchQuerySchema>;
export type MemoryStudioDashboard = z.infer<typeof MemoryStudioDashboardSchema>;
export type CognitiveExplanation = z.infer<typeof CognitiveExplanationSchema>;
export type CognitiveActionImpact = z.infer<typeof CognitiveActionImpactSchema>;
export type CognitiveContextPreview = z.infer<typeof CognitiveContextPreviewSchema>;
