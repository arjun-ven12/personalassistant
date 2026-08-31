import { z } from "zod";
import { AIRequestPurposeSchema } from "./ai.js";

export const AIEconomicPrioritySchema = z.enum([
  "BACKGROUND",
  "NORMAL",
  "IMPORTANT",
  "CRITICAL",
]);
export const AIAutonomyModeSchema = z.enum([
  "INTERACTIVE",
  "ASSISTED",
  "AUTONOMOUS",
  "SCHEDULED",
]);
export const AIBudgetScopeSchema = z.enum([
  "GLOBAL",
  "PROVIDER",
  "MODEL",
  "DEPARTMENT",
  "AGENT",
  "WORKFLOW",
  "COST_CENTER",
]);
export const AIBudgetPeriodSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "PER_RUN"]);
export const AIBudgetOverflowBehaviorSchema = z.enum([
  "DENY",
  "LOCAL_ONLY",
  "DOWNGRADE_MODEL",
  "REQUIRE_APPROVAL",
  "QUEUE",
  "ALLOW_WITH_WARNING",
]);
export const AIBudgetHealthSchema = z.enum([
  "HEALTHY",
  "WATCH",
  "CONSERVE",
  "CRITICAL",
  "EXHAUSTED",
]);
export const AIEconomicActionSchema = z.enum([
  "NORMAL",
  "PREFER_LOCAL",
  "DOWNGRADE",
  "REQUIRE_APPROVAL",
  "DENY",
  "QUEUE",
]);
export const AIUsageSourceSchema = z.enum([
  "PROVIDER_REPORTED",
  "LOCAL_TOKENIZER",
  "ESTIMATED",
]);
export const AIUsageStatusSchema = z.enum([
  "ESTIMATED",
  "SETTLED",
  "ADJUSTED",
  "FAILED",
  "CANCELLED",
]);
export const AIBudgetReservationStatusSchema = z.enum([
  "ACTIVE",
  "SETTLED",
  "RELEASED",
  "EXPIRED",
]);
export const AIEconomicErrorCodeSchema = z.enum([
  "BUDGET_EXHAUSTED",
  "REQUEST_COST_TOO_HIGH",
  "AGENT_BUDGET_EXHAUSTED",
  "WORKFLOW_BUDGET_EXHAUSTED",
  "PROVIDER_BUDGET_EXHAUSTED",
  "UNKNOWN_MODEL_PRICE",
  "RESERVATION_FAILED",
  "RATE_LIMIT_EXCEEDED",
  "OVERRIDE_REQUIRED",
  "ECONOMICS_UNAVAILABLE",
]);
export type AIEconomicErrorCode = z.infer<typeof AIEconomicErrorCodeSchema>;
const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/);
export const AIEconomicOverrideDescriptorSchema = z.object({ ownerId: z.string().uuid(), requestId: z.string().uuid(), purpose: AIRequestPurposeSchema, requestedAdditionalSpendUsd: decimal, maxAdditionalSpendUsd: decimal, expiresAt: z.iso.datetime(), agentId: z.string().uuid().optional(), workflowId: z.string().uuid().optional(), workflowRunId: z.string().uuid().optional(), taskId: z.string().uuid().optional(), costCenter: z.string().max(160).optional(), providerId: z.string().max(80).optional(), modelId: z.string().max(160).optional() }).strict();
export const AIEconomicOverrideGrantSchema = z.object({ id: z.string().uuid(), ownerId: z.string().uuid(), approvalId: z.string().uuid(), requestId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), maxAdditionalSpendUsd: decimal, expiresAt: z.iso.datetime(), status: z.enum(["ACTIVE", "CONSUMED", "EXPIRED", "REVOKED"]), createdAt: z.iso.datetime(), consumedAt: z.iso.datetime().optional() }).strict();
export const AIEconomicOverrideReferenceSchema = z.object({ grantId: z.string().uuid() }).strict();

export const AIEconomicContextSchema = z
  .object({
    ownerId: z.string().uuid(),
    companyId: z.string().uuid().optional(),
    agentId: z.string().uuid().optional(),
    departmentId: z.string().max(160).optional(),
    workflowId: z.string().uuid().optional(),
    workflowRunId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    purpose: AIRequestPurposeSchema,
    autonomyMode: AIAutonomyModeSchema,
    costCenter: z.string().max(160).optional(),
    budgetPolicyId: z.string().uuid().optional(),
    priority: AIEconomicPrioritySchema.default("NORMAL"),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export const AIEconomicUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    source: AIUsageSourceSchema,
  })
  .strict();

export const AIPricingSchema = z
  .object({
    id: z.string().uuid(),
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    currency: z.literal("USD"),
    inputPerMillionTokens: decimal.optional(),
    cachedInputPerMillionTokens: decimal.optional(),
    outputPerMillionTokens: decimal.optional(),
    requestFee: decimal.optional(),
    effectiveFrom: z.iso.datetime(),
    effectiveUntil: z.iso.datetime().optional(),
    version: z.string().min(1).max(80),
    source: z.string().max(240).optional(),
    status: z.enum(["ACTIVE", "HISTORICAL", "UNKNOWN"]),
  })
  .strict();

export const AIBudgetPolicySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    scope: AIBudgetScopeSchema,
    scopeId: z.string().max(160).optional(),
    period: AIBudgetPeriodSchema,
    currency: z.literal("USD"),
    limitUsd: decimal,
    warningThresholdPct: z.number().min(0).max(100),
    throttleThresholdPct: z.number().min(0).max(100).optional(),
    hardStopThresholdPct: z.number().min(0).max(100),
    overflowBehavior: AIBudgetOverflowBehaviorSchema,
    enabled: z.boolean(),
    priority: z.number().int().min(0).max(10_000).optional(),
    maxCallsPerMinute: z.number().int().positive().max(100_000).optional(),
    maxCallsPerRun: z.number().int().positive().max(1_000_000).optional(),
    maxCloudCallsPerRun: z.number().int().positive().max(1_000_000).optional(),
    effectiveFrom: z.iso.datetime(),
    effectiveUntil: z.iso.datetime().optional(),
  })
  .strict();

export const AIBudgetReservationSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    amountUsd: decimal,
    routeId: z.string().uuid().optional(),
    attemptId: z.string().uuid().optional(),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    pricingVersion: z.string().max(80).optional(),
    policyIds: z.array(z.string().uuid()).max(50).optional(),
    context: AIEconomicContextSchema.optional(),
    status: AIBudgetReservationStatusSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    settledAmountUsd: decimal.optional(),
  })
  .strict();

export const AIUsageLedgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    routeId: z.string().uuid().optional(),
    attemptId: z.string().uuid().optional(),
    reservationId: z.string().uuid().optional(),
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    agentId: z.string().uuid().optional(),
    departmentId: z.string().max(160).optional(),
    workflowId: z.string().uuid().optional(),
    workflowRunId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    purpose: AIRequestPurposeSchema,
    locality: z.enum(["LOCAL", "CLOUD"]),
    usage: AIEconomicUsageSchema,
    estimatedCostUsd: decimal.optional(),
    actualCostUsd: decimal.optional(),
    pricingVersion: z.string().max(80).optional(),
    status: AIUsageStatusSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export const AIBudgetEvaluationSchema = z
  .object({
    allowed: z.boolean(),
    applicablePolicies: z.array(AIBudgetPolicySchema).max(50),
    estimatedRequestCostUsd: decimal.optional(),
    remainingBeforeUsd: decimal.optional(),
    remainingAfterEstimateUsd: decimal.optional(),
    state: AIBudgetHealthSchema,
    action: AIEconomicActionSchema,
    reasons: z.array(z.string().max(300)).max(20),
  })
  .strict();

export const AIEconomicEstimateSchema = z
  .object({
    estimatedMinUsd: decimal,
    estimatedMaxUsd: decimal,
    eligible: z.boolean(),
    budgetState: AIBudgetHealthSchema,
    reason: z.string().max(500),
  })
  .strict();
export const AIEconomicOverviewSchema = z
  .object({
    monthToDateSpendUsd: decimal,
    recentSevenDaySpendUsd: decimal,
    remainingUsd: decimal,
    projectedMonthEndUsd: decimal,
    projectedMonthlyFromSevenDayUsd: decimal,
    budgetLimitUsd: decimal.optional(),
    health: AIBudgetHealthSchema,
    localRequests: z.number().int().nonnegative(),
    cloudRequests: z.number().int().nonnegative(),
    totalRequests: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();
export const AIEconomicHealthSchema = z
  .object({
    status: z.enum(["READY", "DEGRADED", "UNAVAILABLE"]),
    persistence: z.enum(["POSTGRESQL", "IN_MEMORY_DEVELOPMENT"]),
    reasons: z.array(z.string().max(300)).max(20),
    pricingEntries: z.number().int().nonnegative(),
    activePolicies: z.number().int().nonnegative(),
    activeReservations: z.number().int().nonnegative(),
    reconciledExpiredReservations: z.number().int().nonnegative(),
  })
  .strict();

export type AIEconomicContext = z.input<typeof AIEconomicContextSchema>;
export type AIUsage = z.infer<typeof AIEconomicUsageSchema>;
export type AIPricing = z.infer<typeof AIPricingSchema>;
export type AIBudgetPolicy = z.infer<typeof AIBudgetPolicySchema>;
export type AIBudgetReservation = z.infer<typeof AIBudgetReservationSchema>;
export type AIUsageLedgerEntry = z.infer<typeof AIUsageLedgerEntrySchema>;
export type AIBudgetEvaluation = z.infer<typeof AIBudgetEvaluationSchema>;
export type AIEconomicEstimate = z.infer<typeof AIEconomicEstimateSchema>;
export type AIEconomicOverview = z.infer<typeof AIEconomicOverviewSchema>;
export type AIEconomicHealth = z.infer<typeof AIEconomicHealthSchema>;
export type AIBudgetScope = z.infer<typeof AIBudgetScopeSchema>;
export type AIEconomicOverrideDescriptor = z.infer<typeof AIEconomicOverrideDescriptorSchema>;
export type AIEconomicOverrideGrant = z.infer<typeof AIEconomicOverrideGrantSchema>;
export type AIEconomicOverrideReference = z.infer<typeof AIEconomicOverrideReferenceSchema>;
