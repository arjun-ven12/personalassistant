import { z } from "zod";

import {
  NativeProviderCapabilitySchema,
  NativeSemanticInteractionTargetSchema,
} from "./native-providers.js";
import { RegistryIdSchema } from "./applications.js";

export const GovernedInteractionCapabilitySchema = NativeProviderCapabilitySchema.extract([
  "launch",
  "focus",
  "open_file",
  "open_workspace",
  "open_url",
  "reload",
  "focus_semantic_control",
  "insert_text",
  "replace_selection",
  "activate_semantic_control",
  "submit_composer",
  "open_selected_resource",
]);

export const GovernedInteractionStatusSchema = z.enum([
  "SUCCESS",
  "UNSUPPORTED",
  "PERMISSION_DENIED",
  "POLICY_DENIED",
  "APP_NOT_RUNNING",
  "TARGET_NOT_FOUND",
  "TARGET_AMBIGUOUS",
  "TARGET_STALE",
  "PROVIDER_UNHEALTHY",
  "SECURE_TARGET_BLOCKED",
  "APPROVAL_REQUIRED",
  "FAILED",
]);

export const GovernedApplicationInteractionRequestSchema = z
  .object({
    applicationId: RegistryIdSchema,
    capability: GovernedInteractionCapabilitySchema,
    target: NativeSemanticInteractionTargetSchema.nullable().default(null),
    text: z.string().min(1).max(8_000).nullable().default(null),
    origin: z.enum(["voice", "planner", "agent", "workflow", "dashboard"]),
    conversationId: z.string().uuid().nullable().default(null),
    proposalId: z.string().uuid().nullable().default(null),
    capabilityCandidateId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      [
        "reload",
        "focus_semantic_control",
        "insert_text",
        "replace_selection",
        "activate_semantic_control",
        "submit_composer",
      ].includes(value.capability) &&
      !value.target
    )
      context.addIssue({ code: "custom", path: ["target"], message: "A frozen semantic target is required." });
    if (["insert_text", "replace_selection"].includes(value.capability) && !value.text)
      context.addIssue({ code: "custom", path: ["text"], message: "Bounded text is required." });
  });

export const GovernedApplicationInteractionResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema.nullable(),
    capability: GovernedInteractionCapabilitySchema,
    status: GovernedInteractionStatusSchema,
    targetSemanticId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    executionRequestId: z.string().uuid().nullable(),
    approvalRequestId: z.string().uuid().nullable(),
    message: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ApplicationInteractionBenchmarkResultSchema = z
  .object({
    totalCases: z.number().int().min(150),
    successfulCases: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    semanticTargetAccuracy: z.number().min(0).max(1),
    unsupportedSafeFailureRate: z.number().min(0).max(1),
    falseInteractionCount: z.number().int().nonnegative(),
    wrongTargetInteractionCount: z.number().int().nonnegative(),
    secureFieldViolationCount: z.number().int().nonnegative(),
    policyBypassCount: z.number().int().nonnegative(),
    approvalBypassCount: z.number().int().nonnegative(),
    genericEscapeCount: z.number().int().nonnegative(),
    averageLatencyMs: z.number().nonnegative(),
    p50LatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
  })
  .strict();

export type GovernedInteractionCapability = z.infer<
  typeof GovernedInteractionCapabilitySchema
>;
export type GovernedInteractionStatus = z.infer<typeof GovernedInteractionStatusSchema>;
export type GovernedApplicationInteractionRequest = z.infer<
  typeof GovernedApplicationInteractionRequestSchema
>;
export type GovernedApplicationInteractionResponse = z.infer<
  typeof GovernedApplicationInteractionResponseSchema
>;
