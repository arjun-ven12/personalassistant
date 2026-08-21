import { z } from "zod";
import type { AIModelSelectorSchema, AIRequestPurposeSchema } from "./ai.js";
import {
  AIInferenceRequestSchema,
  AIModelRoleSchema,
  AIPrivacyRequirementSchema,
} from "./ai.js";
import { AIEconomicContextSchema } from "./ai-economics.js";
import { CognitiveContextProfileSchema } from "./ai-context.js";

export const AIComplexityLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);
export const AIRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const AILocalityPreferenceSchema = z.enum([
  "PREFER_LOCAL",
  "LOCAL_ONLY",
  "ALLOW_REMOTE",
]);
export const AILatencyPreferenceSchema = z.enum(["FAST", "BALANCED", "QUALITY"]);
export const AIRouterOutcomeSchema = z.enum([
  "SUCCESS",
  "NO_AI",
  "CLARIFICATION_REQUIRED",
  "ROUTING_FAILED",
  "CAPABILITY_UNAVAILABLE",
  "CANCELLED",
]);
export const AIRouterAttemptStatusSchema = z.enum([
  "SUCCESS",
  "FAILED",
  "REJECTED_LOW_CONFIDENCE",
  "REJECTED_INVALID_OUTPUT",
  "SKIPPED",
]);

export const AIComplexityHintSchema = z
  .object({
    level: AIComplexityLevelSchema.optional(),
    reason: z.string().max(300).optional(),
  })
  .strict();

export const AIRouterRequestSchema = AIInferenceRequestSchema.extend({
  requestedRole: AIModelRoleSchema.optional(),
  risk: AIRiskLevelSchema.default("LOW"),
  privacy: AIPrivacyRequirementSchema.default("STANDARD"),
  locality: AILocalityPreferenceSchema.default("PREFER_LOCAL"),
  latency: AILatencyPreferenceSchema.default("BALANCED"),
  allowCloud: z.boolean().default(true),
  allowFallback: z.boolean().default(true),
  allowClarification: z.boolean().default(true),
  deterministicResolved: z.boolean().default(false),
  complexityHint: AIComplexityHintSchema.optional(),
  maxAttempts: z.number().int().min(1).max(3).default(3),
  maxCloudEscalations: z.number().int().min(0).max(1).default(1),
  economicContext: AIEconomicContextSchema.optional(),
  economicOverrideGrantId: z.string().uuid().optional(),
  maxCostUsd: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/)
    .optional(),
  contextProfile: CognitiveContextProfileSchema.optional(),
  taskText: z.string().max(16_000).optional(),
  maxContextTokens: z.number().int().positive().max(128_000).optional(),
  economicMaxInputTokens: z.number().int().positive().max(128_000).optional(),
  conversationId: z.string().uuid().optional(),
  agentId: z.string().min(3).max(120).optional(),
  workflowId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
}).strict();

export const AIRouterAttemptSchema = z
  .object({
    attemptId: z.string().uuid().optional(),
    contextId: z.string().uuid().optional(),
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    locality: z.enum(["LOCAL", "REMOTE"]),
    status: AIRouterAttemptStatusSchema,
    reason: z.string().max(300),
    latencyMs: z.number().nonnegative().optional(),
    confidence: z.number().min(0).max(1).optional(),
    errorCode: z.string().max(80).optional(),
  })
  .strict();

export const AIRouteDecisionSchema = z
  .object({
    routeId: z.string().uuid().optional(),
    contextId: z.string().uuid().optional(),
    attemptId: z.string().uuid().optional(),
    complexity: AIComplexityLevelSchema,
    requiredRole: AIModelRoleSchema,
    requiredStructuredOutput: z.boolean(),
    candidateModels: z.array(z.string().max(240)).max(20),
    selectedModel: z.string().max(240).nullable(),
    selectedProvider: z.string().max(80).nullable(),
    reason: z.string().max(500),
    escalated: z.boolean(),
    clarified: z.boolean(),
    economic: z
      .object({
        budgetHealth: z.string().max(40),
        applicableBudgetIds: z.array(z.string().uuid()).max(50),
        estimatedCostUsd: z
          .string()
          .regex(/^\d+(\.\d{1,8})?$/)
          .optional(),
        reservationId: z.string().uuid().optional(),
        economicAction: z.string().max(40),
        reasons: z.array(z.string().max(300)).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AIRouterResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    outcome: AIRouterOutcomeSchema,
    decision: AIRouteDecisionSchema,
    attempts: z.array(AIRouterAttemptSchema).max(3),
    outputText: z.string().optional(),
    structuredOutput: z.json().optional(),
    clarificationQuestion: z.string().max(500).optional(),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    latencyMs: z.number().nonnegative(),
    usage: z.record(z.string(), z.number().nonnegative()).optional(),
  })
  .strict();

export const AIRouterMetricsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    noAI: z.number().int().nonnegative(),
    local: z.number().int().nonnegative(),
    cloud: z.number().int().nonnegative(),
    escalated: z.number().int().nonnegative(),
    clarified: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export type AIRouterRequest = z.input<typeof AIRouterRequestSchema>;
export type AIRouterResponse = z.infer<typeof AIRouterResponseSchema>;
export type AIRouteDecision = z.infer<typeof AIRouteDecisionSchema>;
export type AIRouterAttempt = z.infer<typeof AIRouterAttemptSchema>;
export type AIComplexityLevel = z.infer<typeof AIComplexityLevelSchema>;
export type AIRouterMetrics = z.infer<typeof AIRouterMetricsSchema>;
export type AIRouterRole = z.infer<typeof AIModelRoleSchema>;
export type AIRouterPurpose = z.infer<typeof AIRequestPurposeSchema>;
export type AIRouterSelector = z.infer<typeof AIModelSelectorSchema>;
