import { z } from "zod";

import {
  AdapterCapabilitySchema,
  AdapterPermissionSchema,
  RegistryIdSchema,
} from "./applications.js";
import { SemanticDomainSchema, SemanticCapabilityIdSchema } from "./application-intelligence.js";
import { WorkspaceSemanticObjectTypeSchema } from "./workspace-intelligence.js";

export const AdapterSdkOperationSchema = z.enum([
  "initialize",
  "shutdown",
  "health_check",
  "search",
  "open",
  "create",
  "update",
  "delete",
  "list",
  "navigate",
  "resolve_relationships",
  "emit_events",
  "synchronize",
  "validate_permissions",
]);

export const AdapterLifecycleStateSchema = z.enum([
  "discovered",
  "installed",
  "validated",
  "enabled",
  "active",
  "paused",
  "disabled",
  "archived",
  "removed",
]);

export const AdapterSdkSourceSchema = z.enum([
  "built_in",
  "local_reviewed",
  "third_party_reviewed",
]);

export const AdapterSdkContractRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    providerId: RegistryIdSchema.nullable(),
    adapterName: z.string().min(1).max(160),
    source: AdapterSdkSourceSchema,
    sdkVersion: z.string().min(1).max(40),
    interfaceVersion: z.string().min(1).max(40),
    lifecycleState: AdapterLifecycleStateSchema,
    semanticDomains: z.array(SemanticDomainSchema).max(30),
    capabilities: z.array(AdapterCapabilitySchema).max(80),
    semanticCapabilityIds: z.array(SemanticCapabilityIdSchema).max(100),
    objectTypes: z.array(WorkspaceSemanticObjectTypeSchema).max(80),
    operations: z.array(AdapterSdkOperationSchema).max(30),
    permissions: z.array(AdapterPermissionSchema).max(30),
    dependencies: z.array(z.string().min(1).max(160)).max(50),
    reviewed: z.literal(true),
    sandboxed: z.literal(true),
    plannerAgnostic: z.literal(true),
    rawUiAutomationAvailable: z.literal(false),
    unrestrictedOsApisAvailable: z.literal(false),
    genericExecutionAvailable: z.literal(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterLifecycleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    fromState: AdapterLifecycleStateSchema.nullable(),
    toState: AdapterLifecycleStateSchema,
    reason: z.string().min(1).max(500),
    audited: z.literal(true),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const AdapterSandboxRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    filesystemScope: z.enum(["none", "registered_workspaces", "provider_owned"]),
    networkScope: z.enum(["none", "official_api", "trusted_localhost", "reviewed_endpoint"]),
    allowedPermissions: z.array(AdapterPermissionSchema).max(30),
    allowedCapabilities: z.array(AdapterCapabilitySchema).max(80),
    applicationScope: RegistryIdSchema,
    unrestrictedFilesystemAvailable: z.literal(false),
    unrestrictedNetworkAvailable: z.literal(false),
    unrestrictedOsApisAvailable: z.literal(false),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterDependencyRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    dependencyType: z.enum(["native_provider", "semantic_indexer", "official_api", "extension"]),
    dependencyId: z.string().min(1).max(160),
    required: z.boolean(),
    status: z.enum(["satisfied", "missing", "degraded", "unknown"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    operation: AdapterSdkOperationSchema,
    capability: AdapterCapabilitySchema.nullable(),
    latencyMs: z.number().nonnegative(),
    outcome: z.enum(["success", "denied", "failed", "skipped"]),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterCompatibilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    adapterInstanceId: z.string().uuid(),
    applicationVersion: z.string().min(1).max(80),
    sdkVersion: z.string().min(1).max(40),
    compatibility: z.enum(["compatible", "warning", "unsupported", "unknown"]),
    diagnostics: z.array(z.string().min(1).max(300)).max(50),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterSdkMetadataSchema = z
  .object({
    sdkVersion: z.literal("18D.1"),
    contractOperations: z.array(AdapterSdkOperationSchema),
    lifecycleStates: z.array(AdapterLifecycleStateSchema),
    reviewedAdapterSources: z.array(AdapterSdkSourceSchema),
    plannerRemainsApplicationAgnostic: z.literal(true),
    duplicatesProviderRegistry: z.literal(false),
    duplicatesCapabilityRegistry: z.literal(false),
    duplicatesSemanticObjectModel: z.literal(false),
    duplicatesTransportLayer: z.literal(false),
  })
  .strict();

export const AdapterSdkDashboardResponseSchema = z
  .object({
    contracts: z.array(AdapterSdkContractRecordSchema).max(1_000),
    lifecycle: z.array(AdapterLifecycleRecordSchema).max(2_000),
    sandboxes: z.array(AdapterSandboxRecordSchema).max(1_000),
    dependencies: z.array(AdapterDependencyRecordSchema).max(2_000),
    usage: z.array(AdapterUsageRecordSchema).max(2_000),
    compatibility: z.array(AdapterCompatibilityRecordSchema).max(1_000),
    metadata: AdapterSdkMetadataSchema,
    universalApplicationAdapterSdkAvailable: z.literal(true),
    adaptersInstallIntoExistingFramework: z.literal(true),
    plannerApplicationSpecificLogicAvailable: z.literal(false),
    rawUiAutomationAvailable: z.literal(false),
    genericExecutionAvailable: z.literal(false),
  })
  .strict();

export const AdapterLifecycleTransitionRequestSchema = z
  .object({
    adapterInstanceId: z.string().uuid(),
    toState: AdapterLifecycleStateSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type AdapterSdkContractRecord = z.infer<typeof AdapterSdkContractRecordSchema>;
export type AdapterLifecycleRecord = z.infer<typeof AdapterLifecycleRecordSchema>;
export type AdapterSandboxRecord = z.infer<typeof AdapterSandboxRecordSchema>;
export type AdapterDependencyRecord = z.infer<typeof AdapterDependencyRecordSchema>;
export type AdapterUsageRecord = z.infer<typeof AdapterUsageRecordSchema>;
export type AdapterCompatibilityRecord = z.infer<typeof AdapterCompatibilityRecordSchema>;
export type AdapterLifecycleTransitionRequest = z.infer<
  typeof AdapterLifecycleTransitionRequestSchema
>;
