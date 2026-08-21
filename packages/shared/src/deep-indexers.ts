import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import {
  WorkspaceSemanticObjectTypeSchema,
  WorkspaceSemanticRelationshipSchema,
} from "./workspace-intelligence.js";

export const SemanticIndexerTypeSchema = z.enum([
  "vscode_extension",
  "apple_notes_api",
  "chrome_provider",
  "finder_registered_workspace",
  "calendar_provider",
  "notion_api",
  "generic_reviewed_provider",
]);

export const SemanticIndexerSourceSchema = z.enum([
  "official_api",
  "reviewed_extension",
  "reviewed_native_provider",
]);

export const SemanticIndexerStatusSchema = z.enum([
  "registered",
  "healthy",
  "degraded",
  "disabled",
  "unavailable",
]);

export const SemanticIndexSessionModeSchema = z.enum([
  "initial",
  "incremental",
  "relationship_expansion",
  "health_check",
]);

export const SemanticIndexSessionStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "paused",
]);

export const SemanticIndexEventTypeSchema = z.enum([
  "object_created",
  "object_modified",
  "object_deleted",
  "object_renamed",
  "relationship_changed",
  "tag_changed",
  "workspace_switched",
  "tab_opened",
  "diagnostic_changed",
  "index_started",
  "index_completed",
  "index_failed",
]);

export const SemanticRelationshipUpdateTypeSchema = z.enum([
  "created",
  "updated",
  "deleted",
]);

export const SemanticProviderIndexerRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    applicationId: RegistryIdSchema,
    indexerType: SemanticIndexerTypeSchema,
    source: SemanticIndexerSourceSchema,
    status: SemanticIndexerStatusSchema,
    capabilities: z.array(z.string().min(1).max(120)).max(50),
    permissions: z.array(z.string().min(1).max(120)).max(50),
    supportedObjectTypes: z.array(WorkspaceSemanticObjectTypeSchema).max(50),
    supportsIncremental: z.boolean(),
    version: z.string().min(1).max(80),
    lastIndexedAt: z.iso.datetime().nullable(),
    lastEventAt: z.iso.datetime().nullable(),
    healthScore: z.number().min(0).max(1),
    noUiScraping: z.literal(true),
    noOcr: z.literal(true),
    noScreenshots: z.literal(true),
    noUnrestrictedAccessibility: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticIndexSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    indexerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    applicationId: RegistryIdSchema,
    mode: SemanticIndexSessionModeSchema,
    status: SemanticIndexSessionStatusSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    objectsDiscovered: z.number().int().nonnegative(),
    objectsUpdated: z.number().int().nonnegative(),
    relationshipsUpdated: z.number().int().nonnegative(),
    eventsPublished: z.number().int().nonnegative(),
    failureCode: z.string().min(1).max(120).nullable(),
    diagnostics: z.array(z.string().min(1).max(300)).max(50),
  })
  .strict();

export const SemanticIndexEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    indexerId: z.string().uuid(),
    providerId: RegistryIdSchema,
    applicationId: RegistryIdSchema,
    eventType: SemanticIndexEventTypeSchema,
    objectId: z.string().uuid().nullable(),
    relationshipId: z.string().uuid().nullable(),
    payload: z.record(z.string(), z.unknown()),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const SemanticIndexVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    version: z.string().min(1).max(80),
    semanticFingerprint: z.string().min(16).max(160),
    sourceProviderId: RegistryIdSchema,
    indexedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticFingerprintRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectId: z.string().uuid(),
    fingerprint: z.string().min(16).max(160),
    algorithm: z.literal("sha256"),
    sourceProviderId: RegistryIdSchema,
    calculatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticRelationshipUpdateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    fromObjectId: z.string().uuid(),
    toObjectId: z.string().uuid(),
    relationship: WorkspaceSemanticRelationshipSchema.shape.relationship,
    updateType: SemanticRelationshipUpdateTypeSchema,
    confidence: z.number().min(0).max(1),
    source: z.enum(["provider_indexer", "relationship_expansion", "manual_review"]),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const SemanticIndexerHealthRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    indexerId: z.string().uuid(),
    status: SemanticIndexerStatusSchema,
    objectsIndexed: z.number().int().nonnegative(),
    relationshipsIndexed: z.number().int().nonnegative(),
    lastIncrementalMs: z.number().nonnegative(),
    averageSearchMs: z.number().nonnegative(),
    errorRate: z.number().min(0).max(1),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticSearchStatisticsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    totalObjects: z.number().int().nonnegative(),
    totalRelationships: z.number().int().nonnegative(),
    indexedProviders: z.number().int().nonnegative(),
    averageSearchMs: z.number().nonnegative(),
    lastSearchAt: z.iso.datetime().nullable(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const IncrementalSyncRequestSchema = z
  .object({
    indexerId: z.string().uuid(),
    mode: SemanticIndexSessionModeSchema.default("incremental"),
  })
  .strict();

export const DeepIndexerDashboardResponseSchema = z
  .object({
    indexers: z.array(SemanticProviderIndexerRecordSchema).max(1_000),
    sessions: z.array(SemanticIndexSessionRecordSchema).max(1_000),
    events: z.array(SemanticIndexEventRecordSchema).max(2_000),
    eventLog: z.array(SemanticIndexEventRecordSchema).max(2_000),
    versions: z.array(SemanticIndexVersionRecordSchema).max(5_000),
    fingerprints: z.array(SemanticFingerprintRecordSchema).max(5_000),
    relationshipUpdates: z.array(SemanticRelationshipUpdateRecordSchema).max(5_000),
    health: z.array(SemanticIndexerHealthRecordSchema).max(1_000),
    searchStatistics: SemanticSearchStatisticsRecordSchema,
    deepSemanticIndexersAvailable: z.literal(true),
    reviewedSourcesOnly: z.literal(true),
    uiScrapingAvailable: z.literal(false),
    ocrAvailable: z.literal(false),
    screenshotScrapingAvailable: z.literal(false),
    unrestrictedAccessibilityAvailable: z.literal(false),
    genericFilesystemCrawlingAvailable: z.literal(false),
  })
  .strict();

export const IncrementalSyncResponseSchema = z
  .object({
    session: SemanticIndexSessionRecordSchema,
    dashboard: DeepIndexerDashboardResponseSchema,
  })
  .strict();

export type SemanticProviderIndexerRecord = z.infer<
  typeof SemanticProviderIndexerRecordSchema
>;
export type SemanticIndexSessionRecord = z.infer<
  typeof SemanticIndexSessionRecordSchema
>;
export type SemanticIndexEventRecord = z.infer<typeof SemanticIndexEventRecordSchema>;
export type SemanticIndexVersionRecord = z.infer<
  typeof SemanticIndexVersionRecordSchema
>;
export type SemanticFingerprintRecord = z.infer<
  typeof SemanticFingerprintRecordSchema
>;
export type SemanticRelationshipUpdateRecord = z.infer<
  typeof SemanticRelationshipUpdateRecordSchema
>;
export type SemanticIndexerHealthRecord = z.infer<
  typeof SemanticIndexerHealthRecordSchema
>;
export type SemanticSearchStatisticsRecord = z.infer<
  typeof SemanticSearchStatisticsRecordSchema
>;
export type IncrementalSyncRequest = z.infer<typeof IncrementalSyncRequestSchema>;
