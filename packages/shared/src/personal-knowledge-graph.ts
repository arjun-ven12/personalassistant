import { z } from "zod";

export const KnowledgeEntityTypeSchema = z.enum([
  "PERSON",
  "ORGANIZATION",
  "COMPANY",
  "BUSINESS",
  "TEAM",
  "DEPARTMENT",
  "PROJECT",
  "PRODUCT",
  "SERVICE",
  "APPLICATION",
  "DEVICE",
  "PROVIDER",
  "REPOSITORY",
  "WORKSPACE",
  "FOLDER",
  "FILE",
  "DOCUMENT",
  "NOTE",
  "WEBPAGE",
  "CONVERSATION",
  "MESSAGE",
  "AGENT",
  "AGENT_TEAM",
  "SKILL",
  "CAPABILITY",
  "WORKFLOW",
  "GOAL",
  "OBJECTIVE",
  "TASK",
  "MILESTONE",
  "DECISION",
  "ASSUMPTION",
  "CONSTRAINT",
  "REQUIREMENT",
  "EVENT",
  "MEETING",
  "REMINDER",
  "CUSTOMER",
  "CLIENT",
  "LEAD",
  "CAMPAIGN",
  "METRIC",
  "REPORT",
  "DATASET",
  "CONCEPT",
  "TECHNOLOGY",
  "LANGUAGE",
  "FRAMEWORK",
  "DATABASE",
  "STRATEGY",
  "EXPERIMENT",
  "RESULT",
  "MEMORY",
  "KNOWLEDGE_SOURCE",
]);

export const KnowledgeRelationshipTypeSchema = z.enum([
  "OWNS",
  "CREATED",
  "CREATED_BY",
  "PART_OF",
  "CONTAINS",
  "USES",
  "USED_BY",
  "BUILT_WITH",
  "DEPENDS_ON",
  "BLOCKED_BY",
  "BLOCKS",
  "ASSIGNED_TO",
  "RESPONSIBLE_FOR",
  "WORKS_ON",
  "WORKED_ON",
  "MANAGES",
  "MANAGED_BY",
  "MEMBER_OF",
  "WORKS_FOR",
  "CLIENT_OF",
  "CUSTOMER_OF",
  "CONTACTED",
  "CONTACTED_BY",
  "DISCUSSED_IN",
  "MENTIONED_IN",
  "REFERENCED_BY",
  "REFERENCES",
  "DECIDED_IN",
  "RESULTED_FROM",
  "RESULTED_IN",
  "DERIVED_FROM",
  "RELATED_TO",
  "SIMILAR_TO",
  "REPLACED_BY",
  "SUPERSEDES",
  "PRECEDES",
  "FOLLOWS",
  "LOCATED_IN",
  "STORED_IN",
  "EXECUTED_BY",
  "TRIGGERED_BY",
  "PRODUCED",
  "PRODUCED_BY",
  "HAS_GOAL",
  "CONTRIBUTES_TO",
  "HAS_TASK",
  "HAS_MILESTONE",
  "HAS_SKILL",
  "HAS_CAPABILITY",
  "USES_WORKFLOW",
  "HAS_AGENT",
  "INTERACTS_WITH",
  "APPLIES_TO",
  "HAS_REPOSITORY",
  "HAS_WORKFLOW",
  "HAS_DOCUMENT",
  "ASSOCIATED_WITH",
]);

export const KnowledgeSourceTypeSchema = z.enum([
  "conversation",
  "file",
  "note",
  "calendar",
  "application_adapter",
  "workspace_indexer",
  "workflow",
  "agent",
  "manual",
  "memory",
  "repository",
  "personality_corpus",
  "system",
]);

export const KnowledgeStatusSchema = z.enum([
  "active",
  "candidate",
  "archived",
  "superseded",
]);

export const KnowledgeConflictStatusSchema = z.enum([
  "open",
  "resolved",
  "dismissed",
]);

export const KnowledgeProvenanceSchema = z
  .object({
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().min(1).max(500).nullable().default(null),
    sourceUri: z.string().max(1_000).nullable().default(null),
    sourceTimestamp: z.iso.datetime().nullable().default(null),
    extractionMethod: z
      .enum(["manual", "structured", "deterministic_rules", "semantic_retrieval"])
      .default("structured"),
    confidence: z.number().min(0).max(1).default(0.8),
    evidenceSnippet: z.string().max(1_000).nullable().default(null),
    createdBySystem: z.boolean().default(true),
    ownerConfirmed: z.boolean().default(false),
  })
  .strict();

export const KnowledgeEntitySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    entityType: KnowledgeEntityTypeSchema,
    canonicalName: z.string().min(1).max(255),
    normalizedName: z.string().min(1).max(255),
    displayName: z.string().min(1).max(255),
    description: z.string().max(2_000).nullable().default(null),
    status: KnowledgeStatusSchema.default("active"),
    confidence: z.number().min(0).max(1),
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().max(500).nullable().default(null),
    sourceUri: z.string().max(1_000).nullable().default(null),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    metadata: z.record(z.string(), z.json()).default({}),
    tags: z.array(z.string().min(1).max(80)).max(50).default([]),
    aliases: z.array(z.string().min(1).max(255)).max(100).default([]),
    externalIdentifiers: z.record(z.string(), z.string().max(500)).default({}),
    embeddingReference: z.string().max(500).nullable().default(null),
    isArchived: z.boolean().default(false),
    isPinned: z.boolean().default(false),
    provenance: z.array(KnowledgeProvenanceSchema).max(100).default([]),
    version: z.number().int().positive().default(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeEntityAliasSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    entityId: z.string().uuid(),
    alias: z.string().min(1).max(255),
    normalizedAlias: z.string().min(1).max(255),
    confidence: z.number().min(0).max(1),
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().max(500).nullable().default(null),
    ownerConfirmed: z.boolean().default(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeRelationshipSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sourceEntityId: z.string().uuid(),
    targetEntityId: z.string().uuid(),
    relationshipType: KnowledgeRelationshipTypeSchema,
    direction: z.enum(["forward", "reverse", "bidirectional"]).default("forward"),
    confidence: z.number().min(0).max(1),
    strength: z.number().min(0).max(1).default(0.5),
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().max(500).nullable().default(null),
    evidenceCount: z.number().int().nonnegative().default(1),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    validFrom: z.iso.datetime().nullable().default(null),
    validUntil: z.iso.datetime().nullable().default(null),
    metadata: z.record(z.string(), z.json()).default({}),
    provenance: z.array(KnowledgeProvenanceSchema).max(100).default([]),
    isArchived: z.boolean().default(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeFactSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    subjectEntityId: z.string().uuid(),
    predicate: z.string().min(1).max(160),
    valueType: z.enum(["string", "number", "boolean", "date", "json", "entity"]),
    value: z.json(),
    confidence: z.number().min(0).max(1),
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().max(500).nullable().default(null),
    validFrom: z.iso.datetime().nullable().default(null),
    validUntil: z.iso.datetime().nullable().default(null),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    ownerConfirmed: z.boolean().default(false),
    provenance: z.array(KnowledgeProvenanceSchema).max(100).default([]),
    isArchived: z.boolean().default(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    entityId: z.string().uuid().nullable().default(null),
    relationshipId: z.string().uuid().nullable().default(null),
    factId: z.string().uuid().nullable().default(null),
    sourceType: KnowledgeSourceTypeSchema,
    sourceId: z.string().max(500).nullable().default(null),
    sourceUri: z.string().max(1_000).nullable().default(null),
    evidenceSnippet: z.string().max(1_000).nullable().default(null),
    confidence: z.number().min(0).max(1),
    observedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeConflictSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    entityId: z.string().uuid().nullable().default(null),
    factAId: z.string().uuid().nullable().default(null),
    factBId: z.string().uuid().nullable().default(null),
    relationshipAId: z.string().uuid().nullable().default(null),
    relationshipBId: z.string().uuid().nullable().default(null),
    reason: z.string().min(1).max(1_000),
    status: KnowledgeConflictStatusSchema.default("open"),
    resolution: z.string().max(1_000).nullable().default(null),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable().default(null),
  })
  .strict();

export const KnowledgeGraphEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    eventType: z.string().min(1).max(120),
    entityId: z.string().uuid().nullable().default(null),
    relationshipId: z.string().uuid().nullable().default(null),
    factId: z.string().uuid().nullable().default(null),
    title: z.string().min(1).max(255),
    summary: z.string().max(2_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgePromotionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    memoryId: z.string().uuid(),
    status: z.enum(["candidate", "promoted", "rejected"]).default("candidate"),
    reason: z.string().min(1).max(1_000),
    entityIds: z.array(z.string().uuid()).max(50).default([]),
    relationshipIds: z.array(z.string().uuid()).max(50).default([]),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateKnowledgeEntityRequestSchema = z
  .object({
    entityType: KnowledgeEntityTypeSchema,
    canonicalName: z.string().trim().min(1).max(255),
    displayName: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2_000).optional(),
    aliases: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    metadata: z.record(z.string(), z.json()).default({}),
    sourceType: KnowledgeSourceTypeSchema.default("manual"),
    sourceId: z.string().trim().max(500).optional(),
    confidence: z.number().min(0).max(1).default(1),
    ownerConfirmed: z.boolean().default(true),
  })
  .strict();

export const UpdateKnowledgeEntityRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    aliases: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    status: KnowledgeStatusSchema.optional(),
  })
  .strict();

export const CreateKnowledgeRelationshipRequestSchema = z
  .object({
    sourceEntityId: z.string().uuid(),
    targetEntityId: z.string().uuid(),
    relationshipType: KnowledgeRelationshipTypeSchema,
    confidence: z.number().min(0).max(1).default(0.9),
    strength: z.number().min(0).max(1).default(0.75),
    sourceType: KnowledgeSourceTypeSchema.default("manual"),
    sourceId: z.string().trim().max(500).optional(),
    evidenceSnippet: z.string().trim().max(1_000).optional(),
  })
  .strict();

export const KnowledgeSearchQuerySchema = z
  .object({
    q: z.string().trim().max(255).default(""),
    entityType: KnowledgeEntityTypeSchema.optional(),
    tag: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    depth: z.coerce.number().int().min(0).max(3).default(1),
  })
  .strict();

export const KnowledgePathQuerySchema = z
  .object({
    from: z.string().trim().min(1).max(255),
    to: z.string().trim().min(1).max(255),
    maxDepth: z.coerce.number().int().min(1).max(5).default(3),
  })
  .strict();

export const KnowledgeContextRequestSchema = z
  .object({
    text: z.string().trim().max(1_000).default(""),
    entityIds: z.array(z.string().uuid()).max(20).default([]),
    depth: z.coerce.number().int().min(0).max(3).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export const KnowledgeGraphDashboardResponseSchema = z
  .object({
    statistics: z
      .object({
        entityCount: z.number().int().nonnegative(),
        relationshipCount: z.number().int().nonnegative(),
        factCount: z.number().int().nonnegative(),
        evidenceCount: z.number().int().nonnegative(),
        conflictCount: z.number().int().nonnegative(),
        sourceCount: z.number().int().nonnegative(),
        embeddingCount: z.number().int().nonnegative(),
      })
      .strict(),
    entityTypes: z.array(KnowledgeEntityTypeSchema).max(100),
    relationshipTypes: z.array(KnowledgeRelationshipTypeSchema).max(100),
    recentEntities: z.array(KnowledgeEntitySchema).max(50),
    recentRelationships: z.array(KnowledgeRelationshipSchema).max(100),
    conflicts: z.array(KnowledgeConflictSchema).max(100),
    events: z.array(KnowledgeGraphEventSchema).max(100),
  })
  .strict();

export const KnowledgeSearchResponseSchema = z
  .object({
    query: KnowledgeSearchQuerySchema,
    entities: z.array(KnowledgeEntitySchema).max(100),
    relationships: z.array(KnowledgeRelationshipSchema).max(500),
    facts: z.array(KnowledgeFactSchema).max(200),
  })
  .strict();

export const KnowledgeContextResponseSchema = z
  .object({
    resolvedEntities: z.array(KnowledgeEntitySchema).max(50),
    relatedEntities: z.array(KnowledgeEntitySchema).max(100),
    relationships: z.array(KnowledgeRelationshipSchema).max(500),
    relevantFacts: z.array(KnowledgeFactSchema).max(200),
    conflicts: z.array(KnowledgeConflictSchema).max(100),
    sourceConfidence: z.number().min(0).max(1),
    explanation: z.string().max(2_000),
  })
  .strict();

export const KnowledgePathResponseSchema = z
  .object({
    from: KnowledgeEntitySchema.nullable(),
    to: KnowledgeEntitySchema.nullable(),
    paths: z
      .array(
        z
          .object({
            entities: z.array(KnowledgeEntitySchema).max(10),
            relationships: z.array(KnowledgeRelationshipSchema).max(10),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(25),
  })
  .strict();

export const KnowledgeEntityResponseSchema = z
  .object({
    entity: KnowledgeEntitySchema,
    aliases: z.array(KnowledgeEntityAliasSchema).max(100),
    facts: z.array(KnowledgeFactSchema).max(200),
    relationships: z.array(KnowledgeRelationshipSchema).max(500),
    evidence: z.array(KnowledgeEvidenceSchema).max(200),
  })
  .strict();

export type KnowledgeEntityType = z.infer<typeof KnowledgeEntityTypeSchema>;
export type KnowledgeRelationshipType = z.infer<typeof KnowledgeRelationshipTypeSchema>;
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;
export type KnowledgeEntity = z.infer<typeof KnowledgeEntitySchema>;
export type KnowledgeEntityAlias = z.infer<typeof KnowledgeEntityAliasSchema>;
export type KnowledgeRelationship = z.infer<typeof KnowledgeRelationshipSchema>;
export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;
export type KnowledgeEvidence = z.infer<typeof KnowledgeEvidenceSchema>;
export type KnowledgeConflict = z.infer<typeof KnowledgeConflictSchema>;
export type KnowledgeGraphEvent = z.infer<typeof KnowledgeGraphEventSchema>;
export type KnowledgePromotion = z.infer<typeof KnowledgePromotionSchema>;
export type CreateKnowledgeEntityRequest = z.infer<typeof CreateKnowledgeEntityRequestSchema>;
export type UpdateKnowledgeEntityRequest = z.infer<typeof UpdateKnowledgeEntityRequestSchema>;
export type CreateKnowledgeRelationshipRequest = z.infer<typeof CreateKnowledgeRelationshipRequestSchema>;
export type KnowledgeSearchQuery = z.infer<typeof KnowledgeSearchQuerySchema>;
export type KnowledgePathQuery = z.infer<typeof KnowledgePathQuerySchema>;
export type KnowledgeContextRequest = z.infer<typeof KnowledgeContextRequestSchema>;
