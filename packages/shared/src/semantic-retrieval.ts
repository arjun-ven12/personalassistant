import { z } from "zod";

export const SemanticCategorySchema = z.enum([
  "command",
  "page",
  "button",
  "dialog",
  "form",
  "tab",
  "card",
  "agent_node",
  "repository",
  "workflow",
  "knowledge_node",
  "memory",
  "desktop_capability",
  "navigation_target",
  "setting",
  "voice_shortcut",
  "gesture_shortcut",
  "capability",
  "tool",
  "planner_skill",
  "plugin",
  "ui_element",
]);

export const SemanticVisibilitySchema = z.enum(["visible", "hidden", "disabled"]);
export const SemanticCreationSourceSchema = z.enum([
  "system",
  "dashboard",
  "voice",
  "gesture",
  "command_studio",
  "planner",
  "agent",
  "integration",
]);
export const SemanticAliasSourceSchema = z.enum([
  "manual",
  "learned",
  "suggested",
  "system",
]);
export const SemanticAliasStatusSchema = z.enum([
  "active",
  "suggested",
  "deprecated",
  "rejected",
]);
export const SemanticEmbeddingStatusSchema = z.enum([
  "pending",
  "current",
  "stale",
  "failed",
]);
export const RetrievalMatchKindSchema = z.enum([
  "exact",
  "alias",
  "synonym",
  "vector",
  "lexical",
]);
export const RetrievalResolutionSchema = z.enum([
  "resolved",
  "ambiguous",
  "ai_fallback_required",
  "denied",
]);

const boundedStringArray = z.array(z.string().trim().min(1).max(120)).max(40);

export const SemanticRegistryObjectSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectKey: z.string().trim().min(1).max(180),
    displayName: z.string().trim().min(1).max(180),
    aliases: boundedStringArray,
    description: z.string().trim().max(1_000),
    category: SemanticCategorySchema,
    semanticTags: boundedStringArray,
    permissions: boundedStringArray,
    visibility: SemanticVisibilitySchema,
    supportedActions: boundedStringArray,
    creationSource: SemanticCreationSourceSchema,
    version: z.string().trim().min(1).max(40),
    embeddingVersion: z.string().trim().min(1).max(80).nullable(),
    routePath: z.string().trim().min(1).max(240).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticAliasRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    alias: z.string().trim().min(1).max(160),
    normalizedAlias: z.string().trim().min(1).max(160),
    source: SemanticAliasSourceSchema,
    status: SemanticAliasStatusSchema,
    language: z.string().trim().min(2).max(40).nullable(),
    workspaceId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticEmbeddingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    provider: z.enum(["openai", "disabled"]),
    model: z.string().trim().min(1).max(120),
    dimensions: z.number().int().positive().max(4096),
    embeddingVersion: z.string().trim().min(1).max(80),
    status: SemanticEmbeddingStatusSchema,
    contentHash: z.string().trim().min(1).max(128),
    lastErrorCode: z.string().trim().min(1).max(120).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EmbeddingVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    version: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(400),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SynonymRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid().nullable(),
    term: z.string().trim().min(1).max(80),
    synonyms: boundedStringArray,
    language: z.string().trim().min(2).max(40).nullable(),
    source: z.enum(["system", "manual", "suggested"]),
    status: z.enum(["active", "suggested", "deprecated"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RetrievalCandidateSchema = z
  .object({
    objectId: z.string().uuid(),
    objectKey: z.string(),
    displayName: z.string(),
    category: SemanticCategorySchema,
    routePath: z.string().nullable(),
    matchKind: RetrievalMatchKindSchema,
    confidence: z.number().min(0).max(1),
    lexicalScore: z.number().min(0).max(1),
    semanticScore: z.number().min(0).max(1),
    contextScore: z.number().min(0).max(1),
    reasons: z.array(z.string().min(1).max(160)).max(12),
    supportedActions: boundedStringArray,
  })
  .strict();

export const RetrievalHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    query: z.string().trim().min(1).max(500),
    normalizedQuery: z.string().trim().min(1).max(500),
    source: z.enum(["voice", "gesture", "planner", "agent", "dashboard", "api"]),
    resolution: RetrievalResolutionSchema,
    selectedObjectId: z.string().uuid().nullable(),
    selectedConfidence: z.number().min(0).max(1),
    candidateCount: z.number().int().nonnegative(),
    aiEscalationReason: z.string().trim().max(300).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const RetrievalMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: z.enum(["voice", "gesture", "planner", "agent", "dashboard", "api"]),
    latencyMs: z.number().nonnegative(),
    cacheHit: z.boolean(),
    candidateCount: z.number().int().nonnegative(),
    resolution: RetrievalResolutionSchema,
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const SemanticUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    query: z.string().trim().min(1).max(500),
    source: z.enum(["voice", "gesture", "planner", "agent", "dashboard", "api"]),
    success: z.boolean(),
    confidence: z.number().min(0).max(1),
    usedAt: z.iso.datetime(),
  })
  .strict();

export const ContextRankingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    contextKey: z.string().trim().min(1).max(160),
    objectId: z.string().uuid(),
    weight: z.number().min(0).max(1),
    source: z.enum(["system", "usage", "manual"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticPermissionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    permission: z.string().trim().min(1).max(120),
    allowed: z.boolean(),
    reason: z.string().trim().min(1).max(400),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RegisterSemanticObjectRequestSchema = z
  .object({
    objectKey: z.string().trim().min(1).max(180),
    displayName: z.string().trim().min(1).max(180),
    aliases: boundedStringArray.default([]),
    description: z.string().trim().max(1_000).default(""),
    category: SemanticCategorySchema,
    semanticTags: boundedStringArray.default([]),
    permissions: boundedStringArray.default([]),
    visibility: SemanticVisibilitySchema.default("visible"),
    supportedActions: boundedStringArray.default(["open"]),
    creationSource: SemanticCreationSourceSchema.default("dashboard"),
    version: z.string().trim().min(1).max(40).default("1.0.0"),
    routePath: z.string().trim().min(1).max(240).nullable().default(null),
  })
  .strict();

export const SemanticRetrievalSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    source: z.enum(["voice", "gesture", "planner", "agent", "dashboard", "api"]),
    currentPage: z.string().trim().min(1).max(240).nullable().default(null),
    workspaceId: z.string().uuid().nullable().default(null),
    repositoryId: z.string().uuid().nullable().default(null),
    categories: z.array(SemanticCategorySchema).max(20).default([]),
    limit: z.number().int().min(1).max(25).default(8),
    confidenceThreshold: z.number().min(0).max(1).default(0.78),
  })
  .strict();

export const UpsertSemanticAliasRequestSchema = z
  .object({
    objectId: z.string().uuid(),
    alias: z.string().trim().min(1).max(160),
    source: SemanticAliasSourceSchema.default("manual"),
    status: SemanticAliasStatusSchema.default("active"),
    language: z.string().trim().min(2).max(40).nullable().default(null),
    workspaceId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const UpsertSynonymRequestSchema = z
  .object({
    term: z.string().trim().min(1).max(80),
    synonyms: boundedStringArray,
    language: z.string().trim().min(2).max(40).nullable().default(null),
    status: z.enum(["active", "suggested", "deprecated"]).default("active"),
  })
  .strict();

export const SemanticRetrievalSearchResponseSchema = z
  .object({
    query: z.string(),
    normalizedQuery: z.string(),
    resolution: RetrievalResolutionSchema,
    selected: RetrievalCandidateSchema.nullable(),
    candidates: z.array(RetrievalCandidateSchema),
    aiEscalationReason: z.string().nullable(),
    cacheHit: z.boolean(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

export const SemanticIntelligenceDashboardResponseSchema = z
  .object({
    registry: z.array(SemanticRegistryObjectSchema),
    aliases: z.array(SemanticAliasRecordSchema),
    synonyms: z.array(SynonymRecordSchema),
    embeddings: z.array(SemanticEmbeddingRecordSchema),
    retrievalHistory: z.array(RetrievalHistoryRecordSchema),
    metrics: z.array(RetrievalMetricRecordSchema),
    usage: z.array(SemanticUsageRecordSchema),
    stats: z.object({
      registryCount: z.number().int().nonnegative(),
      aliasCount: z.number().int().nonnegative(),
      synonymCount: z.number().int().nonnegative(),
      embeddingCount: z.number().int().nonnegative(),
      aiEscalationCount: z.number().int().nonnegative(),
      deterministicResolutionCount: z.number().int().nonnegative(),
    }),
  });

export type SemanticCategory = z.infer<typeof SemanticCategorySchema>;
export type SemanticRegistryObject = z.infer<typeof SemanticRegistryObjectSchema>;
export type SemanticAliasRecord = z.infer<typeof SemanticAliasRecordSchema>;
export type SemanticEmbeddingRecord = z.infer<typeof SemanticEmbeddingRecordSchema>;
export type EmbeddingVersionRecord = z.infer<typeof EmbeddingVersionRecordSchema>;
export type SynonymRecord = z.infer<typeof SynonymRecordSchema>;
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;
export type RetrievalHistoryRecord = z.infer<typeof RetrievalHistoryRecordSchema>;
export type RetrievalMetricRecord = z.infer<typeof RetrievalMetricRecordSchema>;
export type SemanticUsageRecord = z.infer<typeof SemanticUsageRecordSchema>;
export type ContextRankingRecord = z.infer<typeof ContextRankingRecordSchema>;
export type SemanticPermissionRecord = z.infer<typeof SemanticPermissionRecordSchema>;
export type SemanticRetrievalSearchRequest = z.infer<typeof SemanticRetrievalSearchRequestSchema>;
export type SemanticRetrievalSearchResponse = z.infer<typeof SemanticRetrievalSearchResponseSchema>;
export type RegisterSemanticObjectRequest = z.infer<
  typeof RegisterSemanticObjectRequestSchema
>;
export type UpsertSemanticAliasRequest = z.infer<typeof UpsertSemanticAliasRequestSchema>;
export type UpsertSynonymRequest = z.infer<typeof UpsertSynonymRequestSchema>;
export type SemanticIntelligenceDashboardResponse = z.infer<
  typeof SemanticIntelligenceDashboardResponseSchema
>;
