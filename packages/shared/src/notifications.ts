import { z } from "zod";
import { Ed25519PublicKeySchema } from "./devices.js";
import { CreateObjectiveRequestSchema } from "./objectives.js";

export const ExecutiveNotificationCategorySchema = z.enum([
  "APPROVAL_REQUIRED",
  "OBJECTIVE_AT_RISK",
  "OBJECTIVE_BLOCKED",
  "WORKFLOW_FAILED",
  "WORKFLOW_BLOCKED",
  "AGENT_ESCALATION",
  "BUDGET_WARNING",
  "BUDGET_APPROVAL",
  "SECURITY_EVENT",
  "DEVICE_EVENT",
  "EXPERIMENT_COMPLETED",
  "IMPORTANT_OBJECTIVE_COMPLETED",
]);

export const ExecutiveNotificationSeveritySchema = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "CRITICAL",
]);

export const ExecutiveNotificationObjectKindSchema = z.enum([
  "APPROVAL",
  "OBJECTIVE",
  "WORKFLOW",
  "AGENT",
  "ECONOMY",
  "EXPERIMENT",
  "SYSTEM",
  "DEVICE",
]);

export const DevicePushRegistrationOperationSchema = z
  .object({
    operation: z.literal("register_push_token"),
    pushToken: z.string().trim().min(20).max(4_096),
    platform: z.literal("ANDROID"),
    appVersion: z.string().trim().min(1).max(80),
  })
  .strict();

export const DevicePushUnregistrationOperationSchema = z
  .object({ operation: z.literal("unregister_push_token") })
  .strict();

export const NotificationPreferenceValuesSchema = z
  .object({
    approvals: z.boolean(),
    objectiveRisk: z.boolean(),
    workflowFailures: z.boolean(),
    budgetAlerts: z.boolean(),
    securityAlerts: z.literal(true),
    experimentResults: z.boolean(),
    deviceEvents: z.boolean(),
  })
  .strict();

export const NotificationPreferencesResponseSchema = z
  .object({
    preferences: NotificationPreferenceValuesSchema,
    securityAlertsMandatory: z.literal(true),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const UpdateNotificationPreferencesOperationSchema = z
  .object({
    operation: z.literal("update_notification_preferences"),
    preferences: NotificationPreferenceValuesSchema.partial(),
  })
  .strict();

export const MobileRecentAuthChallengeOperationSchema = z
  .object({
    operation: z.literal("mobile_recent_auth_challenge"),
    purpose: z.literal("approve_high_risk_action"),
  })
  .strict();

export const MobileRecentAuthVerifyOperationSchema = z
  .object({
    operation: z.literal("mobile_recent_auth_verify"),
    challengeId: z.string().uuid(),
    challengeToken: z.string().min(32).max(200),
    biometricSignature: z.string().trim().min(80).max(200),
  })
  .strict();

export const MobileBiometricKeyRegistrationOperationSchema = z
  .object({
    operation: z.literal("register_mobile_biometric_key"),
    publicKey: Ed25519PublicKeySchema,
  })
  .strict();

export const MobileBiometricKeyRegistrationResponseSchema = z
  .object({ registered: z.literal(true), deviceId: z.string().uuid() })
  .strict();

export const mobileRecentAuthSigningPayload = (
  challengeId: string,
  challengeToken: string,
  deviceId: string,
) => `alexa-mobile-recent-auth:v1:${challengeId}:${challengeToken}:${deviceId}`;

export const MobileApprovalDecisionOperationSchema = z
  .object({
    operation: z.literal("approval_decision"),
    approvalId: z.string().uuid(),
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const MobileObjectiveActionOperationSchema = z
  .object({
    operation: z.literal("objective_action"),
    objectiveId: z.string().uuid(),
    action: z.enum(["pause", "resume", "cancel", "replan"]),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const MobileObjectiveCreateOperationSchema = z
  .object({
    operation: z.literal("objective_create"),
    request: CreateObjectiveRequestSchema,
  })
  .strict();

export const MobileObjectiveModifyOperationSchema = z
  .object({
    operation: z.literal("objective_modify"),
    objectiveId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    budgetCredits: z.number().int().min(1).max(10_000_000).optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  })
  .strict()
  .refine((value) => value.budgetCredits !== undefined || value.priority !== undefined, {
    message: "At least one bounded objective change is required.",
  });

export const PushRegistrationResponseSchema = z
  .object({
    registered: z.boolean(),
    deviceId: z.string().uuid(),
    enabled: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExecutiveAttentionResponseSchema = z
  .object({
    total: z.number().int().nonnegative(),
    pendingApprovals: z.number().int().nonnegative(),
    blockedObjectives: z.number().int().nonnegative(),
    atRiskObjectives: z.number().int().nonnegative(),
    criticalSecurityEvents: z.number().int().nonnegative(),
  })
  .strict();

export const ExecutivePushPayloadSchema = z
  .object({
    type: ExecutiveNotificationCategorySchema,
    objectKind: ExecutiveNotificationObjectKindSchema,
    objectId: z.string().trim().min(1).max(160),
    eventId: z.string().trim().min(1).max(200),
    severity: ExecutiveNotificationSeveritySchema,
    title: z.string().trim().min(1).max(100),
  })
  .strict();

export type ExecutiveNotificationCategory = z.infer<
  typeof ExecutiveNotificationCategorySchema
>;
export type ExecutiveNotificationSeverity = z.infer<
  typeof ExecutiveNotificationSeveritySchema
>;
export type ExecutivePushPayload = z.infer<typeof ExecutivePushPayloadSchema>;
export type NotificationPreferenceValues = z.infer<
  typeof NotificationPreferenceValuesSchema
>;
