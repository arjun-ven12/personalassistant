import { z } from "zod";

import { NetworkVerificationResultSchema } from "./network.js";

export const CsrfTokenResponseSchema = z
  .object({
    token: z.string().min(32).max(128),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const RecentAuthPurposeSchema = z.enum([
  "approve_high_risk_action",
  "modify_security_settings",
  "revoke_trusted_device",
  "generate_recovery_codes",
]);

export const RecentAuthChallengeRequestSchema = z
  .object({ purpose: RecentAuthPurposeSchema })
  .strict();

export const RecentAuthChallengeResponseSchema = z
  .object({
    challengeId: z.string().uuid(),
    challengeToken: z.string().min(32).max(128),
    purpose: RecentAuthPurposeSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const RecentAuthVerifyPasswordRequestSchema = z
  .object({
    challengeId: z.string().uuid(),
    challengeToken: z.string().min(32).max(128),
    password: z.string().min(1).max(128),
  })
  .strict();

export const RecentAuthStatusSchema = z
  .object({
    active: z.boolean(),
    purpose: RecentAuthPurposeSchema.optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();

export const RecoveryCodeStatusSchema = z
  .object({
    unusedCount: z.number().int().nonnegative(),
    generatedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const RecoveryCodeGenerationResponseSchema = z
  .object({
    codes: z.array(z.string().regex(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/)),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export const RecoveryCodeInvalidationResponseSchema = z
  .object({ success: z.literal(true) })
  .strict();

export const RecoveryCodeVerifyRequestSchema = z
  .object({
    email: z.email().transform((value) => value.toLowerCase()),
    code: z.string().regex(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/),
  })
  .strict();

export const RecoveryCodeVerifyResponseSchema = z
  .object({
    verified: z.literal(true),
    nextStep: z.literal("LOCAL_PASSWORD_RESET_REQUIRED"),
  })
  .strict();

export const ReadinessCheckStateSchema = z.enum(["ready", "unavailable"]);
export const MigrationStateSchema = z.enum(["current", "outdated", "unknown"]);
export const PrivateNetworkReadinessSchema = z.enum([
  "verified",
  "not_verified",
  "unavailable",
]);

export const ReadinessResponseSchema = z
  .object({
    ready: z.boolean(),
    timestamp: z.iso.datetime(),
    checks: z
      .object({
        database: ReadinessCheckStateSchema,
        migrations: MigrationStateSchema,
        securityState: ReadinessCheckStateSchema,
        privateNetwork: PrivateNetworkReadinessSchema,
        privilegedExecutionAvailable: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const SecurityReadinessResponseSchema = z
  .object({
    database: ReadinessCheckStateSchema,
    migrations: MigrationStateSchema,
    privateNetwork: PrivateNetworkReadinessSchema,
    secureCookies: z.boolean(),
    csrfProtection: z.literal(true),
    trustedProxyConfigured: z.boolean(),
    persistentIdentityStore: z.boolean(),
    persistentGovernanceStore: z.boolean(),
    recentAuthenticationAvailable: z.literal(true),
    emergencyStopActive: z.boolean(),
    privilegedExecutionAvailable: z.literal(false),
    readOnlyCapabilityExecution: z
      .enum(["available", "unavailable"])
      .default("unavailable"),
    writeExecutionAvailable: z.literal(false).default(false),
  })
  .strict();

export const NetworkStatusResponseSchema = NetworkVerificationResultSchema;

export type RecentAuthPurpose = z.infer<typeof RecentAuthPurposeSchema>;
export type RecentAuthStatus = z.infer<typeof RecentAuthStatusSchema>;
export type SecurityReadinessResponse = z.infer<typeof SecurityReadinessResponseSchema>;
