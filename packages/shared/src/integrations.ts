import { z } from "zod";

export const IntegrationProviderSchema = z.enum([
  "github",
  "jira",
  "slack",
  "notion",
  "vscode",
  "github_actions",
  "vercel",
  "gmail",
  "crm",
  "analytics",
]);

export const IntegrationCategorySchema = z.enum([
  "git_provider",
  "issue_tracker",
  "communication",
  "documentation",
  "ide",
  "ci_cd",
  "deployment",
  "crm",
  "analytics",
]);

export const IntegrationStatusSchema = z.enum([
  "available",
  "installed",
  "auth_required",
  "ready",
  "disabled",
  "unhealthy",
]);

export const IntegrationCredentialKindSchema = z.enum([
  "oauth",
  "pat",
  "service_account",
  "oidc",
  "device_flow",
  "local_app",
]);

export const IntegrationCapabilityRiskSchema = z.enum(["low", "medium", "high"]);

export const IntegrationOperationStatusSchema = z.enum([
  "REQUESTED",
  "WAITING_APPROVAL",
  "APPROVED",
  "DENIED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const IntegrationPermissionStateSchema = z.enum([
  "granted",
  "revoked",
  "denied",
]);

export const IntegrationCapabilitySchema = z
  .object({
    id: z.string().min(3).max(120),
    integrationId: z.string().min(3).max(120),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    category: IntegrationCategorySchema,
    risk: IntegrationCapabilityRiskSchema,
    approvalRequired: z.boolean(),
    destructive: z.boolean(),
    operations: z.array(z.string().min(3).max(120)).min(1).max(50),
    enabled: z.boolean(),
  })
  .strict();

export const IntegrationRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    provider: IntegrationProviderSchema,
    category: IntegrationCategorySchema,
    displayName: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    status: IntegrationStatusSchema,
    installedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    disabledAt: z.iso.datetime().nullable(),
    configuration: z.record(z.string().max(80), z.json()).default({}),
    supportedAuth: z.array(IntegrationCredentialKindSchema).min(1).max(10),
    healthSummary: z.string().min(1).max(500),
  })
  .strict();

export const IntegrationPermissionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    integrationId: z.string().min(3).max(120),
    capabilityId: z.string().min(3).max(120),
    state: IntegrationPermissionStateSchema,
    approvalRequired: z.boolean(),
    rateLimitPerMinute: z.number().int().min(1).max(1_000),
    grantedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const IntegrationHealthSchema = z
  .object({
    integrationId: z.string().min(3).max(120),
    state: z.enum(["unknown", "healthy", "degraded", "unhealthy"]),
    checkedAt: z.iso.datetime(),
    latencyMs: z.number().int().nonnegative().max(60_000).nullable(),
    reasonCode: z.string().min(1).max(120),
    credentialStatus: z.enum(["missing", "configured", "expired", "revoked"]),
    rateLimitRemaining: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const IntegrationUsageSchema = z
  .object({
    integrationId: z.string().min(3).max(120),
    operationCount: z.number().int().nonnegative(),
    deniedCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    lastOperationAt: z.iso.datetime().nullable(),
  })
  .strict();

export const IntegrationOperationRequestSchema = z
  .object({
    integrationId: z.string().min(3).max(120),
    capabilityId: z.string().min(3).max(120),
    operation: z.string().min(3).max(120),
    target: z.string().min(1).max(500),
    reason: z.string().min(1).max(1_000),
    dryRun: z.boolean().default(true),
    parameters: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict();

export const IntegrationOperationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    integrationId: z.string().min(3).max(120),
    capabilityId: z.string().min(3).max(120),
    operation: z.string().min(3).max(120),
    target: z.string().min(1).max(500),
    reason: z.string().min(1).max(1_000),
    dryRun: z.boolean(),
    status: IntegrationOperationStatusSchema,
    approvalRequired: z.boolean(),
    policyDecision: z.enum(["allow", "deny", "approval_required"]),
    resultSummary: z.string().min(1).max(1_000),
    requestedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    parameters: z.record(z.string().max(80), z.json()).default({}),
  })
  .strict();

export const IntegrationDashboardResponseSchema = z
  .object({
    integrations: z.array(IntegrationRecordSchema).max(100),
    capabilities: z.array(IntegrationCapabilitySchema).max(500),
    permissions: z.array(IntegrationPermissionSchema).max(500),
    health: z.array(IntegrationHealthSchema).max(100),
    usage: z.array(IntegrationUsageSchema).max(100),
    operations: z.array(IntegrationOperationRecordSchema).max(200),
  })
  .strict();

export const IntegrationListResponseSchema = z.array(IntegrationRecordSchema).max(100);
export const IntegrationCapabilityListResponseSchema = z
  .array(IntegrationCapabilitySchema)
  .max(500);
export const IntegrationPermissionListResponseSchema = z
  .array(IntegrationPermissionSchema)
  .max(500);
export const IntegrationOperationListResponseSchema = z
  .array(IntegrationOperationRecordSchema)
  .max(200);
export const IntegrationOperationResponseSchema = z
  .object({ operation: IntegrationOperationRecordSchema })
  .strict();
export const IntegrationHealthResponseSchema = z
  .object({ health: z.array(IntegrationHealthSchema).max(100) })
  .strict();

export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;
export type IntegrationCategory = z.infer<typeof IntegrationCategorySchema>;
export type IntegrationRecord = z.infer<typeof IntegrationRecordSchema>;
export type IntegrationCapability = z.infer<typeof IntegrationCapabilitySchema>;
export type IntegrationPermission = z.infer<typeof IntegrationPermissionSchema>;
export type IntegrationHealth = z.infer<typeof IntegrationHealthSchema>;
export type IntegrationUsage = z.infer<typeof IntegrationUsageSchema>;
export type IntegrationOperationRequest = z.infer<
  typeof IntegrationOperationRequestSchema
>;
export type IntegrationOperationRecord = z.infer<
  typeof IntegrationOperationRecordSchema
>;
