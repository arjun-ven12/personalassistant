import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";

export const SemanticDomainSchema = z.enum([
  "code_editing",
  "note_taking",
  "task_management",
  "calendar",
  "browser",
  "messaging",
  "email",
  "music",
  "file_management",
  "knowledge_base",
  "database",
  "terminal",
  "documents",
  "design",
  "communication",
]);

export const SemanticObjectTypeSchema = z.enum([
  "note",
  "page",
  "task",
  "event",
  "document",
  "workspace",
  "repository",
  "folder",
  "file",
  "conversation",
  "playlist",
  "browser_tab",
]);

export const SemanticCapabilityIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+){1,2}$/);

export const ApplicationDomainRecordSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    domain: SemanticDomainSchema,
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    extensible: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticApplicationCapabilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    capabilityId: SemanticCapabilityIdSchema,
    domain: SemanticDomainSchema,
    displayName: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    objectTypes: z.array(SemanticObjectTypeSchema).max(20),
    requiredPermissions: z.array(z.string().min(1).max(120)).max(30),
    riskLevel: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
    plannerVisible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationProviderCapabilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    domain: SemanticDomainSchema,
    implementation: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
    enabled: z.boolean(),
    permissionState: z.enum(["missing", "partial", "granted", "unknown"]),
    healthState: z.enum(["healthy", "degraded", "unavailable", "unknown"]),
    source: z.enum(["native_provider", "adapter_profile", "browser_registry", "plugin"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    domain: SemanticDomainSchema,
    status: z.enum(["active", "background", "closed", "unknown"]),
    currentObjectId: z.string().min(1).max(180).nullable(),
    contextSummary: z.string().max(500),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationMemoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    domain: SemanticDomainSchema,
    preferenceScore: z.number().min(0).max(1),
    recentUseScore: z.number().min(0).max(1),
    successRate: z.number().min(0).max(1),
    failureCount: z.number().int().nonnegative(),
    notes: z.array(z.string().min(1).max(240)).max(20),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ProviderSelectionRequestSchema = z
  .object({
    capabilityId: SemanticCapabilityIdSchema,
    domain: SemanticDomainSchema.optional(),
    preferredApplicationId: RegistryIdSchema.optional(),
    origin: z.enum(["planner", "voice", "gesture", "agent", "dashboard", "command"]),
  })
  .strict();

export const ProviderSelectionCandidateSchema = z
  .object({
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    score: z.number().min(0).max(1),
    reasons: z.array(z.string().min(1).max(180)).max(20),
    permissionState: z.enum(["missing", "partial", "granted", "unknown"]),
    healthState: z.enum(["healthy", "degraded", "unavailable", "unknown"]),
  })
  .strict();

export const ProviderSelectionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    capabilityId: SemanticCapabilityIdSchema,
    domain: SemanticDomainSchema,
    origin: z.enum(["planner", "voice", "gesture", "agent", "dashboard", "command"]),
    selectedApplicationId: RegistryIdSchema.nullable(),
    selectedProviderId: RegistryIdSchema.nullable(),
    selected: z.boolean(),
    candidates: z.array(ProviderSelectionCandidateSchema).max(25),
    decisionReason: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CrossApplicationWorkflowRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    domains: z.array(SemanticDomainSchema).max(20),
    capabilityIds: z.array(SemanticCapabilityIdSchema).max(50),
    providerIds: z.array(RegistryIdSchema).max(50),
    status: z.enum(["draft", "available", "degraded", "disabled"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticObjectRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    objectType: SemanticObjectTypeSchema,
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    stableObjectId: z.string().min(1).max(240),
    label: z.string().min(1).max(240),
    metadata: z.record(z.string(), z.unknown()),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationIntelligenceDashboardResponseSchema = z
  .object({
    domains: z.array(ApplicationDomainRecordSchema).max(100),
    capabilities: z.array(SemanticApplicationCapabilityRecordSchema).max(1_000),
    providerCapabilities: z.array(ApplicationProviderCapabilityRecordSchema).max(2_000),
    sessions: z.array(ApplicationSessionRecordSchema).max(500),
    memory: z.array(ApplicationMemoryRecordSchema).max(1_000),
    providerSelectionHistory: z.array(ProviderSelectionRecordSchema).max(500),
    crossApplicationWorkflows: z.array(CrossApplicationWorkflowRecordSchema).max(500),
    semanticObjects: z.array(SemanticObjectRecordSchema).max(10_000),
    universalApplicationIntelligenceAvailable: z.literal(true),
    plannerUsesSemanticCapabilities: z.literal(true),
    applicationsAreInterchangeableProviders: z.literal(true),
    rawApplicationAutomationAvailable: z.literal(false),
  })
  .strict();

export const ProviderSelectionResponseSchema = z
  .object({
    selection: ProviderSelectionRecordSchema,
    dashboard: ApplicationIntelligenceDashboardResponseSchema,
  })
  .strict();

export type SemanticDomain = z.infer<typeof SemanticDomainSchema>;
export type SemanticCapabilityId = z.infer<typeof SemanticCapabilityIdSchema>;
export type ApplicationDomainRecord = z.infer<typeof ApplicationDomainRecordSchema>;
export type SemanticApplicationCapabilityRecord = z.infer<
  typeof SemanticApplicationCapabilityRecordSchema
>;
export type ApplicationProviderCapabilityRecord = z.infer<
  typeof ApplicationProviderCapabilityRecordSchema
>;
export type ApplicationSessionRecord = z.infer<typeof ApplicationSessionRecordSchema>;
export type ApplicationMemoryRecord = z.infer<typeof ApplicationMemoryRecordSchema>;
export type ProviderSelectionRequest = z.infer<typeof ProviderSelectionRequestSchema>;
export type ProviderSelectionRecord = z.infer<typeof ProviderSelectionRecordSchema>;
export type CrossApplicationWorkflowRecord = z.infer<
  typeof CrossApplicationWorkflowRecordSchema
>;
export type SemanticObjectRecord = z.infer<typeof SemanticObjectRecordSchema>;
