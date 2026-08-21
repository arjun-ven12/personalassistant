import { z } from "zod";
import { AIPrivacyRequirementSchema } from "./ai.js";
import { AIRiskLevelSchema } from "./ai-router.js";

export const AIBenchmarkCategorySchema = z.enum([
  "VOICE_INTERPRETATION",
  "INTENT_CLASSIFICATION",
  "ENTITY_EXTRACTION",
  "CLARIFICATION",
  "NON_EXECUTION",
  "CONVERSATION",
  "STRUCTURED_OUTPUT",
  "SUMMARIZATION",
  "WRITING",
  "CODING",
  "BUSINESS_ANALYSIS",
  "CONTEXT_RETRIEVAL",
  "ROUTING",
  "PRIVACY",
  "COST",
  "LATENCY",
  "RESILIENCE",
  "OTHER",
]);
export const AIBenchmarkRunModeSchema = z.enum([
  "DRY_RUN",
  "FAST",
  "LOCAL",
  "LIVE_PAID",
  "LOAD",
]);
export const AIBenchmarkStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "NEEDS_REVIEW",
  "SKIPPED",
]);
export const AIBenchmarkEvaluatorSchema = z.enum([
  "EXACT_MATCH",
  "INTENT",
  "ENTITY",
  "SCHEMA",
  "CLARIFICATION",
  "NON_EXECUTION",
  "ROUTING",
  "PRIVACY",
  "COST",
  "LATENCY",
  "GROUNDING",
]);
export const AIBenchmarkExpectationSchema = z
  .object({
    expectedIntent: z.string().max(160).optional(),
    expectedEntities: z.record(z.string(), z.json()).optional(),
    mustClarify: z.boolean().optional(),
    mustNotExecute: z.boolean().optional(),
    expectedProvider: z.string().max(80).optional(),
    expectedLocality: z.enum(["LOCAL", "REMOTE"]).optional(),
    requiredContextIds: z.array(z.string().max(240)).max(30).optional(),
    forbiddenContextIds: z.array(z.string().max(240)).max(30).optional(),
    expectedFields: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export const AIBenchmarkCaseSchema = z
  .object({
    id: z.string().min(1).max(160),
    version: z.string().max(40),
    category: AIBenchmarkCategorySchema,
    input: z.string().max(16_000),
    expected: AIBenchmarkExpectationSchema.optional(),
    contextFixture: z.array(z.unknown()).max(100).optional(),
    routingFixture: z.record(z.string(), z.json()).optional(),
    risk: AIRiskLevelSchema.optional(),
    privacy: AIPrivacyRequirementSchema.optional(),
    tags: z.array(z.string().max(80)).max(30).optional(),
    weight: z.number().positive().max(100).optional(),
    evaluators: z.array(AIBenchmarkEvaluatorSchema).max(10).optional(),
  })
  .strict();
export const AIBenchmarkSuiteSchema = z
  .object({
    id: z.string().min(1).max(160),
    version: z.string().max(40),
    name: z.string().min(1).max(240),
    cases: z.array(AIBenchmarkCaseSchema).max(10_000),
    description: z.string().max(1_000).optional(),
  })
  .strict();
export const AIBenchmarkMetricSchema = z
  .object({
    name: z.string().max(120),
    value: z.number(),
    numerator: z.number().nonnegative().optional(),
    denominator: z.number().positive().optional(),
    unit: z.string().max(40).optional(),
  })
  .strict();
export const AIBenchmarkCaseResultSchema = z
  .object({
    caseId: z.string().max(160),
    status: AIBenchmarkStatusSchema,
    metrics: z.array(AIBenchmarkMetricSchema).max(30),
    errorCode: z.string().max(100).optional(),
    reason: z.string().max(500).optional(),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    latencyMs: z.number().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    costUsd: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .optional(),
    contextTokens: z.number().int().nonnegative().optional(),
    safetyCriticalFailure: z.boolean().optional(),
  })
  .strict();
export const AIBenchmarkRunSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    suiteId: z.string().max(160),
    suiteVersion: z.string().max(40),
    mode: AIBenchmarkRunModeSchema,
    status: z.enum([
      "PENDING",
      "RUNNING",
      "PASS",
      "FAIL",
      "NEEDS_REVIEW",
      "CANCELLED",
      "SKIPPED",
    ]),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    caseCount: z.number().int().nonnegative(),
    results: z.array(AIBenchmarkCaseResultSchema).max(10_000),
    metrics: z.array(AIBenchmarkMetricSchema).max(100),
    safetyCriticalFailures: z.number().int().nonnegative(),
    paidOptIn: z.boolean(),
    baseline: z.boolean().default(false),
    routingPolicyVersion: z.string().max(80).optional(),
    contextProfileVersion: z.string().max(80).optional(),
    runtimeVersion: z.string().max(80).optional(),
    environment: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export const AIBenchmarkProfileSchema = z
  .object({
    providerId: z.string().max(80),
    modelId: z.string().max(160),
    sampleCount: z.number().int().nonnegative(),
    interpretationAccuracy: z.number().min(0).max(1).optional(),
    entityAccuracy: z.number().min(0).max(1).optional(),
    clarificationAccuracy: z.number().min(0).max(1).optional(),
    nonExecutionAccuracy: z.number().min(0).max(1).optional(),
    structuredOutputFirstPassRate: z.number().min(0).max(1).optional(),
    structuredOutputFinalRate: z.number().min(0).max(1).optional(),
    averageLatencyMs: z.number().nonnegative().optional(),
    p50LatencyMs: z.number().nonnegative().optional(),
    p95LatencyMs: z.number().nonnegative().optional(),
    averageInputTokens: z.number().nonnegative().optional(),
    averageOutputTokens: z.number().nonnegative().optional(),
    averageCostUsd: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .optional(),
    costPerAcceptedResultUsd: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const AIBenchmarkRegressionSchema = z
  .object({
    metric: z.string().max(120),
    baseline: z.number(),
    current: z.number(),
    deltaPct: z.number(),
    severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
    reason: z.string().max(500),
  })
  .strict();
export const AIRuntimeHealthSchema = z
  .object({
    overall: z.enum(["HEALTHY", "DEGRADED", "CONSTRAINED", "CRITICAL"]),
    readiness: z.enum([
      "DETERMINISTIC_READY",
      "LOCAL_READY",
      "CLOUD_READY",
      "HYBRID_READY",
      "DEGRADED",
    ]),
    components: z
      .array(
        z
          .object({
            name: z.string().max(80),
            status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "CONSTRAINED"]),
            detail: z.string().max(300),
          })
          .strict(),
      )
      .max(30),
    checkedAt: z.iso.datetime(),
  })
  .strict();
export type AIBenchmarkCategory = z.infer<typeof AIBenchmarkCategorySchema>;
export type AIBenchmarkCase = z.infer<typeof AIBenchmarkCaseSchema>;
export type AIBenchmarkExecutionCase = Omit<AIBenchmarkCase, "expected">;
export type AIBenchmarkSuite = z.infer<typeof AIBenchmarkSuiteSchema>;
export type AIBenchmarkCaseResult = z.infer<typeof AIBenchmarkCaseResultSchema>;
export type AIBenchmarkRun = z.infer<typeof AIBenchmarkRunSchema>;
export type AIBenchmarkProfile = z.infer<typeof AIBenchmarkProfileSchema>;
export type AIBenchmarkRegression = z.infer<typeof AIBenchmarkRegressionSchema>;
export type AIRuntimeHealth = z.infer<typeof AIRuntimeHealthSchema>;
