import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { SemanticDomainSchema, SemanticObjectTypeSchema } from "./application-intelligence.js";

export const WorkspaceSemanticObjectTypeSchema = z.enum([
  "workspace",
  "repository",
  "folder",
  "document",
  "file",
  "class",
  "function",
  "method",
  "variable",
  "note",
  "notebook",
  "page",
  "task",
  "project",
  "calendar",
  "event",
  "email",
  "conversation",
  "playlist",
  "browser_tab",
  "bookmark",
  "image",
  "table",
  "database",
  "content_block",
]);

export const WorkspaceSemanticObjectSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    workspaceId: z.string().min(1).max(180).nullable(),
    objectType: WorkspaceSemanticObjectTypeSchema,
    universalType: SemanticObjectTypeSchema.optional(),
    title: z.string().min(1).max(240),
    summary: z.string().max(1_000),
    stableObjectId: z.string().min(1).max(300),
    parentObjectId: z.string().uuid().nullable(),
    tags: z.array(z.string().min(1).max(80)).max(50),
    createdAt: z.iso.datetime().nullable(),
    modifiedAt: z.iso.datetime().nullable(),
    discoveredAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    author: z.string().max(160).nullable(),
    openState: z.enum(["open", "closed", "background", "unknown"]),
    pinned: z.boolean(),
    favorite: z.boolean(),
    priority: z.number().min(0).max(1),
    recentUsageScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    metadata: z.record(z.string(), z.unknown()),
    contentPreview: z.string().max(2_000),
    sensitiveContentRedacted: z.literal(true),
  })
  .strict();

export const SemanticWorkspaceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    domain: SemanticDomainSchema,
    title: z.string().min(1).max(200),
    rootObjectId: z.string().uuid().nullable(),
    status: z.enum(["active", "indexed", "degraded", "unavailable"]),
    objectCount: z.number().int().nonnegative(),
    lastIndexedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceSemanticRelationshipSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    fromObjectId: z.string().uuid(),
    toObjectId: z.string().uuid(),
    relationship: z.enum([
      "contains",
      "references",
      "related_to",
      "implements",
      "defines",
      "attached_to",
      "opened_from",
      "derived_from",
      "mentions",
    ]),
    confidence: z.number().min(0).max(1),
    source: z.enum(["provider", "indexer", "memory", "manual", "demonstration"]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceSemanticContextSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    currentApplicationId: RegistryIdSchema.nullable(),
    currentProviderId: RegistryIdSchema.nullable(),
    currentWorkspaceId: z.string().max(180).nullable(),
    currentObjectId: z.string().uuid().nullable(),
    currentRepository: z.string().max(180).nullable(),
    currentFile: z.string().max(300).nullable(),
    currentBrowserTab: z.string().max(300).nullable(),
    currentSelection: z.string().max(300).nullable(),
    workingSetObjectIds: z.array(z.string().uuid()).max(100),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceMemoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    memoryType: z.enum([
      "frequent",
      "recent",
      "pinned",
      "favorite",
      "working_set",
      "navigation_path",
      "cross_reference",
    ]),
    score: z.number().min(0).max(1),
    lastUsedAt: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const SemanticNavigationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    query: z.string().min(1).max(500),
    resolvedObjectId: z.string().uuid().nullable(),
    providerId: RegistryIdSchema.nullable(),
    applicationId: RegistryIdSchema.nullable(),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SemanticIndexRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    searchText: z.string().max(4_000),
    keywordTokens: z.array(z.string().min(1).max(80)).max(200),
    indexedAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceSemanticSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    objectTypes: z.array(WorkspaceSemanticObjectTypeSchema).max(25).optional(),
    applicationId: RegistryIdSchema.optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const WorkspaceSemanticSearchResultSchema = z
  .object({
    object: WorkspaceSemanticObjectSchema,
    score: z.number().min(0).max(1),
    reasons: z.array(z.string().min(1).max(180)).max(20),
  })
  .strict();

export const WorkspaceSemanticSearchResponseSchema = z
  .object({
    query: z.string(),
    results: z.array(WorkspaceSemanticSearchResultSchema).max(50),
    searchedAt: z.iso.datetime(),
  })
  .strict();

export const WorkspaceIntelligenceDashboardResponseSchema = z
  .object({
    workspaces: z.array(SemanticWorkspaceRecordSchema).max(1_000),
    objects: z.array(WorkspaceSemanticObjectSchema).max(10_000),
    relationships: z.array(WorkspaceSemanticRelationshipSchema).max(10_000),
    contexts: z.array(WorkspaceSemanticContextSchema).max(500),
    indexes: z.array(SemanticIndexRecordSchema).max(10_000),
    navigation: z.array(SemanticNavigationRecordSchema).max(1_000),
    history: z.array(SemanticNavigationRecordSchema).max(1_000),
    memory: z.array(WorkspaceMemoryRecordSchema).max(2_000),
    semanticWorkspaceIntelligenceAvailable: z.literal(true),
    plannerUsesSemanticObjects: z.literal(true),
    rawContentAutomationAvailable: z.literal(false),
  })
  .strict();

export type WorkspaceSemanticObject = z.infer<
  typeof WorkspaceSemanticObjectSchema
>;
export type SemanticWorkspaceRecord = z.infer<typeof SemanticWorkspaceRecordSchema>;
export type WorkspaceSemanticRelationship = z.infer<
  typeof WorkspaceSemanticRelationshipSchema
>;
export type WorkspaceSemanticContext = z.infer<typeof WorkspaceSemanticContextSchema>;
export type WorkspaceMemoryRecord = z.infer<typeof WorkspaceMemoryRecordSchema>;
export type SemanticNavigationRecord = z.infer<typeof SemanticNavigationRecordSchema>;
export type SemanticIndexRecord = z.infer<typeof SemanticIndexRecordSchema>;
export type WorkspaceSemanticSearchRequest = z.infer<
  typeof WorkspaceSemanticSearchRequestSchema
>;
