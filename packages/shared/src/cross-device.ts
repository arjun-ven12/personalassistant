import { z } from "zod";

export const CrossDeviceClientTypeSchema = z.enum(["WEB", "ANDROID"]);
export const CrossDeviceTargetTypeSchema = z.enum(["WEB", "ANDROID", "MAC"]);
export const CrossDevicePresenceSchema = z.enum(["ONLINE", "OFFLINE", "DEGRADED"]);

export const CrossDeviceCapabilitySchema = z.enum([
  "NAVIGATE_TO_ROUTE",
  "OPEN_OBJECTIVE",
  "OPEN_AGENT",
  "OPEN_WORKFLOW",
  "OPEN_APPROVAL",
  "OPEN_CONVERSATION",
  "FOCUS_SEARCH",
  "REFRESH_VIEW",
  "SHOW_SCREEN",
  "OPEN_APPLICATION",
  "FOCUS_APPLICATION",
  "OPEN_URL",
]);

export const CrossDeviceRouteSchema = z.enum([
  "/",
  "/conversation",
  "/automation",
  "/agents",
  "/workflows",
  "/objectives",
  "/skills",
  "/applications",
  "/workspace",
  "/devices",
  "/spatial",
  "/ai",
  "/security",
  "/approvals",
  "/engineering",
]);

export const CrossDeviceApplicationSchema = z.enum([
  "chrome",
  "safari",
  "figma",
  "chatgpt",
  "codex",
  "vscode",
  "finder",
]);

export const CrossDeviceArgumentsSchema = z
  .object({
    route: CrossDeviceRouteSchema.optional(),
    objectId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9:_-]+$/).optional(),
    applicationId: CrossDeviceApplicationSchema.optional(),
    url: z.string().url().max(2_048).refine((value) => value.startsWith("https://"), {
      message: "Only HTTPS URLs may be routed between clients.",
    }).optional(),
  })
  .strict();

export const CrossDeviceCommandStatusSchema = z.enum([
  "CREATED",
  "RESOLVING_TARGET",
  "WAITING_APPROVAL",
  "AUTHORIZED",
  "DISPATCHED",
  "ACKNOWLEDGED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "TARGET_OFFLINE",
]);

export const CrossDeviceFailureCodeSchema = z.enum([
  "TARGET_REQUIRED",
  "TARGET_AMBIGUOUS",
  "TARGET_NOT_FOUND",
  "TARGET_OFFLINE",
  "CAPABILITY_UNAVAILABLE",
  "SOURCE_DEVICE_REVOKED",
  "OWNER_SCOPE_MISMATCH",
  "APPROVAL_REQUIRED",
  "POLICY_DENIED",
  "DELIVERY_EXPIRED",
  "TARGET_REVOKED",
  "EXECUTION_FAILED",
  "INVALID_RESULT",
]);

export const CrossDeviceClientInstanceSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().min(1).max(200),
    trustedDeviceId: z.string().uuid().nullable(),
    clientType: CrossDeviceClientTypeSchema,
    displayName: z.string().trim().min(1).max(120),
    platform: z.string().trim().min(1).max(80),
    capabilities: z.array(CrossDeviceCapabilitySchema).max(30),
    currentRoute: CrossDeviceRouteSchema.nullable(),
    presence: CrossDevicePresenceSchema,
    connectedAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    leaseExpiresAt: z.iso.datetime(),
  })
  .strict();

export const RegisterCrossDeviceClientRequestSchema = z
  .object({
    clientInstanceId: z.string().uuid(),
    clientType: CrossDeviceClientTypeSchema,
    displayName: z.string().trim().min(1).max(120),
    platform: z.string().trim().min(1).max(80),
    capabilities: z.array(CrossDeviceCapabilitySchema).min(1).max(30),
    currentRoute: CrossDeviceRouteSchema.nullable().default(null),
  })
  .strict();

export const CrossDeviceHeartbeatRequestSchema = z
  .object({
    clientInstanceId: z.string().uuid(),
    currentRoute: CrossDeviceRouteSchema.nullable().optional(),
    capabilities: z.array(CrossDeviceCapabilitySchema).min(1).max(30).optional(),
  })
  .strict();

export const CrossDeviceUtteranceRequestSchema = z
  .object({
    utterance: z.string().trim().min(1).max(1_000),
    clientInstanceId: z.string().uuid(),
    clientType: CrossDeviceClientTypeSchema,
    conversationId: z.string().uuid().nullable().default(null),
    currentRoute: CrossDeviceRouteSchema.nullable().default(null),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const CrossDeviceCommandSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sourceClientInstanceId: z.string().uuid(),
    sourceDeviceId: z.string().uuid().nullable(),
    sourceClientType: CrossDeviceClientTypeSchema,
    targetType: CrossDeviceTargetTypeSchema.nullable(),
    targetId: z.string().uuid().nullable(),
    targetDisplayName: z.string().min(1).max(120).nullable(),
    capability: CrossDeviceCapabilitySchema.nullable(),
    arguments: CrossDeviceArgumentsSchema,
    status: CrossDeviceCommandStatusSchema,
    failureCode: CrossDeviceFailureCodeSchema.nullable(),
    safeMessage: z.string().min(1).max(500),
    idempotencyKey: z.string().uuid(),
    conversationId: z.string().uuid().nullable(),
    executionRequestId: z.string().uuid().nullable(),
    approvalRequestId: z.string().uuid().nullable(),
    acknowledgedAt: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const CrossDeviceUtteranceResponseSchema = z
  .object({
    handled: z.boolean(),
    command: CrossDeviceCommandSchema.nullable(),
    responseText: z.string().min(1).max(500).nullable(),
    clarificationTargets: z.array(z.string().min(1).max(120)).max(10),
  })
  .strict();

export const CrossDevicePollRequestSchema = z
  .object({
    clientInstanceId: z.string().uuid(),
    currentRoute: CrossDeviceRouteSchema.nullable().optional(),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

export const CrossDevicePollResponseSchema = z
  .object({
    client: CrossDeviceClientInstanceSchema,
    commands: z.array(CrossDeviceCommandSchema).max(20),
    polledAt: z.iso.datetime(),
  })
  .strict();

export const CrossDeviceCommandReceiptRequestSchema = z
  .object({
    clientInstanceId: z.string().uuid(),
    commandId: z.string().uuid(),
    status: z.enum(["ACKNOWLEDGED", "EXECUTING", "SUCCEEDED", "FAILED", "REJECTED"]),
    failureCode: CrossDeviceFailureCodeSchema.nullable().default(null),
    safeMessage: z.string().trim().min(1).max(500),
  })
  .strict();

export const CrossDeviceClientListResponseSchema = z
  .object({
    clients: z.array(CrossDeviceClientInstanceSchema).max(100),
    serverTime: z.iso.datetime(),
  })
  .strict();

export type CrossDeviceClientType = z.infer<typeof CrossDeviceClientTypeSchema>;
export type CrossDeviceTargetType = z.infer<typeof CrossDeviceTargetTypeSchema>;
export type CrossDeviceCapability = z.infer<typeof CrossDeviceCapabilitySchema>;
export type CrossDeviceFailureCode = z.infer<typeof CrossDeviceFailureCodeSchema>;
export type CrossDeviceArguments = z.infer<typeof CrossDeviceArgumentsSchema>;
export type CrossDeviceClientInstance = z.infer<typeof CrossDeviceClientInstanceSchema>;
export type CrossDeviceCommand = z.infer<typeof CrossDeviceCommandSchema>;
export type CrossDeviceUtteranceRequest = z.infer<typeof CrossDeviceUtteranceRequestSchema>;
