import { z } from "zod";

import { AdapterPermissionSchema, RegistryIdSchema } from "./applications.js";
import {
  NativeProviderCapabilitySchema,
  NativeProviderExecutionStatusSchema,
} from "./native-providers.js";
import {
  SemanticCapabilityIdSchema,
  SemanticDomainSchema,
} from "./application-intelligence.js";
import { WorkspaceSemanticObjectTypeSchema } from "./workspace-intelligence.js";

export const CoreAdapterIdSchema = z.enum([
  "vscode",
  "finder",
  "chrome",
  "safari",
  "terminal",
  "apple_notes",
  "calendar",
  "reminders",
]);

export const CoreAdapterStatusSchema = z.enum([
  "installed",
  "enabled",
  "active",
  "degraded",
  "disabled",
  "unavailable",
]);

export const CoreAdapterCapabilityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    displayName: z.string().min(1).max(160),
    domain: SemanticDomainSchema,
    operation: z.enum([
      "open",
      "create",
      "update",
      "delete",
      "search",
      "list",
      "navigate",
      "read",
      "execute",
    ]),
    objectTypes: z.array(WorkspaceSemanticObjectTypeSchema).max(20),
    requiredPermissions: z.array(AdapterPermissionSchema).max(30),
    nativeProviderCapability: NativeProviderCapabilitySchema.nullable(),
    officialApiRequired: z.boolean(),
    approvalRequired: z.boolean(),
    enabled: z.boolean(),
    verified: z.literal(true),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CoreAdapterRecordSchema = z
  .object({
    id: CoreAdapterIdSchema,
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    displayName: z.string().min(1).max(160),
    bundleIdentifier: z.string().min(3).max(255),
    status: CoreAdapterStatusSchema,
    semanticDomains: z.array(SemanticDomainSchema).max(20),
    supportedObjectTypes: z.array(WorkspaceSemanticObjectTypeSchema).max(50),
    sdkContractId: z.string().uuid().nullable(),
    providerId: RegistryIdSchema.nullable(),
    providerVersion: z.string().max(80).nullable(),
    dependencyState: z.enum(["satisfied", "missing", "degraded", "partial"]),
    health: z.number().min(0).max(1),
    diagnostics: z.array(z.string().min(1).max(300)).max(50),
    currentContextId: z.string().uuid().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationContextSnapshotRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    currentDocument: z.string().max(240).nullable(),
    currentWorkspace: z.string().max(180).nullable(),
    currentTab: z.string().max(240).nullable(),
    currentFolder: z.string().max(240).nullable(),
    currentProject: z.string().max(180).nullable(),
    currentReminderList: z.string().max(180).nullable(),
    currentCalendar: z.string().max(180).nullable(),
    currentSelection: z.string().max(300).nullable(),
    sessionIds: z.array(z.string().uuid()).max(50),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationSessionRecord18ESchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    status: z.enum(["active", "background", "closed", "unknown"]),
    currentObjectId: z.string().uuid().nullable(),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AdapterActionHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    origin: z.enum(["planner", "voice", "gesture", "agent", "dashboard", "command"]),
    status: NativeProviderExecutionStatusSchema,
    providerId: RegistryIdSchema.nullable(),
    executionRequestId: z.string().uuid().nullable(),
    verificationSummary: z.string().min(1).max(500),
    errorCode: z.string().min(1).max(120).nullable(),
    requestedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const AdapterHealthMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    health: z.number().min(0).max(1),
    latencyMs: z.number().nonnegative(),
    failureRate: z.number().min(0).max(1),
    permissionState: z.enum(["missing", "partial", "granted", "unknown"]),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const AdapterPermissionStatusRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    permission: AdapterPermissionSchema,
    granted: z.boolean(),
    requiredByCapabilities: z.array(SemanticCapabilityIdSchema).max(50),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SemanticActionHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    semanticObjectType: WorkspaceSemanticObjectTypeSchema.nullable(),
    argumentsSummary: z.string().max(500),
    riskLevel: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
    approvalRequired: z.boolean(),
    outcome: z.enum(["requested", "denied", "queued", "completed", "failed"]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationUsageRecord18ESchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    adapterId: CoreAdapterIdSchema,
    applicationId: RegistryIdSchema,
    capabilityId: SemanticCapabilityIdSchema.nullable(),
    useCount: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    lastUsedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CoreAdapterSemanticActionRequestSchema = z
  .object({
    adapterId: CoreAdapterIdSchema,
    capabilityId: SemanticCapabilityIdSchema,
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
    origin: z.enum(["planner", "voice", "gesture", "agent", "dashboard", "command"]),
    approvedCommandId: z.string().uuid().optional(),
  })
  .strict();

export const CoreAdapterSemanticActionResponseSchema = z
  .object({
    action: AdapterActionHistoryRecordSchema,
    semanticAction: SemanticActionHistoryRecordSchema,
  })
  .strict();

export const CoreAdapterDashboardResponseSchema = z
  .object({
    adapters: z.array(CoreAdapterRecordSchema).max(100),
    capabilities: z.array(CoreAdapterCapabilityRecordSchema).max(1_000),
    sessions: z.array(ApplicationSessionRecord18ESchema).max(500),
    contextSnapshots: z.array(ApplicationContextSnapshotRecordSchema).max(1_000),
    recentActions: z.array(AdapterActionHistoryRecordSchema).max(2_000),
    healthMetrics: z.array(AdapterHealthMetricRecordSchema).max(2_000),
    permissionStatus: z.array(AdapterPermissionStatusRecordSchema).max(2_000),
    semanticActions: z.array(SemanticActionHistoryRecordSchema).max(2_000),
    usage: z.array(ApplicationUsageRecord18ESchema).max(1_000),
    coreApplicationAdapterSuiteAvailable: z.literal(true),
    usesExistingAdapterSdk: z.literal(true),
    usesExistingProviderRuntime: z.literal(true),
    plannerApplicationSpecificLogicAvailable: z.literal(false),
    rawUiAutomationAvailable: z.literal(false),
    genericExecutionAvailable: z.literal(false),
  })
  .strict();

export type CoreAdapterId = z.infer<typeof CoreAdapterIdSchema>;
export type CoreAdapterRecord = z.infer<typeof CoreAdapterRecordSchema>;
export type CoreAdapterCapabilityRecord = z.infer<
  typeof CoreAdapterCapabilityRecordSchema
>;
export type ApplicationContextSnapshotRecord = z.infer<
  typeof ApplicationContextSnapshotRecordSchema
>;
export type ApplicationSessionRecord18E = z.infer<
  typeof ApplicationSessionRecord18ESchema
>;
export type AdapterActionHistoryRecord = z.infer<
  typeof AdapterActionHistoryRecordSchema
>;
export type AdapterHealthMetricRecord = z.infer<
  typeof AdapterHealthMetricRecordSchema
>;
export type AdapterPermissionStatusRecord = z.infer<
  typeof AdapterPermissionStatusRecordSchema
>;
export type SemanticActionHistoryRecord = z.infer<
  typeof SemanticActionHistoryRecordSchema
>;
export type ApplicationUsageRecord18E = z.infer<
  typeof ApplicationUsageRecord18ESchema
>;
export type CoreAdapterSemanticActionRequest = z.infer<
  typeof CoreAdapterSemanticActionRequestSchema
>;
