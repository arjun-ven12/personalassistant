import { z } from "zod";

import {
  CompanyDataSensitivitySchema,
  MetadataLineageEdgeSchema,
} from "./company-data.js";

const uuid = z.string().uuid();
const boundedKey = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const optionalUuid = uuid.nullable();

export const TelemetryRetentionClassSchema = z.enum([
  "SHORT",
  "STANDARD",
  "EXTENDED",
  "SECURITY_CRITICAL",
]);
export const TelemetryErrorSourceSchema = z.enum([
  "PLANNING",
  "SCHEDULER",
  "AGENT",
  "MODEL",
  "CAPABILITY",
  "INTEGRATION",
  "DATABASE",
  "POLICY",
  "APPROVAL",
  "BUDGET",
  "DEVICE",
  "UNKNOWN",
]);
export const TelemetryAttributeValueSchema = z.union([
  z.string().max(240),
  z.number().finite(),
  z.boolean(),
]);
export const SystemTelemetrySpanSchema = z
  .object({
    id: uuid,
    traceId: z.string().min(16).max(64),
    spanId: z.string().min(8).max(32),
    parentSpanId: z.string().min(8).max(32).nullable(),
    ownerId: uuid,
    companyId: optionalUuid,
    service: boundedKey,
    operation: z.string().trim().min(1).max(240),
    status: z.enum(["OK", "ERROR"]),
    errorSource: TelemetryErrorSourceSchema.nullable(),
    durationMs: z.number().nonnegative().max(86_400_000),
    objectiveId: optionalUuid,
    workflowId: optionalUuid,
    taskId: optionalUuid,
    assignmentId: optionalUuid,
    agentDefinitionId: boundedKey.nullable(),
    capabilityId: boundedKey.nullable(),
    provider: boundedKey.nullable(),
    model: z.string().trim().min(1).max(160).nullable(),
    attributes: z.record(z.string().min(1).max(120), TelemetryAttributeValueSchema),
    retentionClass: TelemetryRetentionClassSchema,
    sampled: z.boolean(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const AIEvaluationScoreSchema = z
  .object({
    name: boundedKey,
    value: z.number().min(0).max(1),
    source: z.enum([
      "HUMAN_REVIEW",
      "TASK_VERIFIER",
      "WORKFLOW_EVALUATOR",
      "BENCHMARK",
    ]),
    recordedAt: z.iso.datetime(),
  })
  .strict();
export const AIObservabilityTraceSchema = z
  .object({
    id: uuid,
    traceId: z.string().min(16).max(64),
    ownerId: uuid,
    companyId: uuid,
    assignmentId: optionalUuid,
    taskId: optionalUuid,
    objectiveId: optionalUuid,
    workflowId: optionalUuid,
    agentDefinitionId: boundedKey.nullable(),
    provider: boundedKey,
    model: z.string().trim().min(1).max(160),
    promptVersion: boundedKey.nullable(),
    policyVersion: boundedKey.nullable(),
    taskClass: boundedKey,
    reasoningType: z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "STRUCTURED"]),
    locality: z.enum(["LOCAL", "REMOTE"]),
    latencyMs: z.number().nonnegative().max(86_400_000),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costCredits: z.number().nonnegative(),
    costUsd: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .nullable(),
    success: z.boolean(),
    retries: z.number().int().nonnegative().max(100),
    reviewOutcome: z.enum(["PASS", "FAIL", "NOT_REVIEWED"]).default("NOT_REVIEWED"),
    verificationResult: z
      .enum(["VERIFIED", "FAILED", "NOT_VERIFIED"])
      .default("NOT_VERIFIED"),
    evaluationScores: z.array(AIEvaluationScoreSchema).max(40),
    dataSensitivity: CompanyDataSensitivitySchema,
    exportPolicy: z.enum(["LOCAL_ONLY", "METADATA_ONLY", "APPROVED_EXTERNAL"]),
    retentionClass: TelemetryRetentionClassSchema,
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const PortfolioMetricViewSchema = z
  .object({
    ownerId: uuid,
    companyId: uuid,
    companyName: z.string().trim().min(1).max(160),
    canonicalMetricKey: boundedKey,
    metricId: uuid,
    metricVersion: z.number().int().positive(),
    definitionFingerprint: z.string().length(64),
    value: z
      .string()
      .regex(/^-?\d+(\.\d{1,12})?$/)
      .nullable(),
    previousValue: z
      .string()
      .regex(/^-?\d+(\.\d{1,12})?$/)
      .nullable(),
    delta: z.number().finite().nullable(),
    deltaPercent: z.number().finite().nullable(),
    trend: z.enum(["UP", "DOWN", "FLAT", "INSUFFICIENT_DATA"]),
    unit: z.string().trim().min(1).max(40),
    period: z.string().trim().min(1).max(120),
    dimensions: z.array(boundedKey).max(40),
    freshness: z.enum(["FRESH", "STALE", "CONFLICTED", "UNAVAILABLE"]),
    quality: z.enum(["VERIFIED", "DEGRADED", "CONFLICT", "UNAVAILABLE"]),
    observedAt: z.iso.datetime().nullable(),
    lineageRefs: z.array(uuid).max(100),
  })
  .strict();
export const PortfolioMetricCompatibilitySchema = z
  .object({
    status: z.enum(["COMPARABLE", "NOT_DIRECTLY_COMPARABLE"]),
    canonicalMetricKey: boundedKey,
    reasons: z.array(z.string().min(1).max(240)).max(20),
    views: z.array(PortfolioMetricViewSchema).max(100),
  })
  .strict();

export const PortfolioHealthComponentSchema = z
  .object({
    dimension: z.enum([
      "BUSINESS",
      "DATA",
      "SYSTEM",
      "AI",
      "OBJECTIVES",
      "WORKFORCE",
      "ECONOMY",
    ]),
    state: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1).max(240)).max(20),
  })
  .strict();
export const PortfolioAttentionSignalSchema = z
  .object({
    id: z.string().min(1).max(240),
    ownerId: uuid,
    companyId: uuid,
    companyName: z.string().min(1).max(160),
    signalType: boundedKey,
    title: z.string().min(1).max(240),
    severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]),
    confidence: z.number().min(0).max(1),
    businessImpact: z.number().min(0).max(1),
    urgency: z.number().min(0).max(1),
    recoverability: z.number().min(0).max(1),
    priority: z.number().min(0).max(4),
    evidenceRefs: z.array(z.string().min(1).max(240)).max(40),
    status: z.enum(["OPEN", "ACKNOWLEDGED", "SNOOZED"]),
    snoozedUntil: z.iso.datetime().nullable(),
    detectedAt: z.iso.datetime(),
  })
  .strict();
export const PortfolioCompanySummarySchema = z
  .object({
    companyId: uuid,
    companyName: z.string().min(1).max(160),
    companyStatus: z.string().min(1).max(40),
    health: z.array(PortfolioHealthComponentSchema).max(10),
    metrics: z.array(PortfolioMetricViewSchema).max(100),
    dataAlerts: z.number().int().nonnegative(),
    systemIncidents: z.number().int().nonnegative(),
    aiSpendCredits: z.number().nonnegative(),
    aiSuccessRate: z.number().min(0).max(1).nullable(),
    integrationHealth: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
  })
  .strict();
export const PortfolioSystemOverviewSchema = z
  .object({
    serviceHealth: z
      .array(
        z
          .object({
            service: boundedKey,
            state: z.enum(["HEALTHY", "DEGRADED", "DOWN", "UNKNOWN"]),
            requests: z.number().int().nonnegative(),
            errors: z.number().int().nonnegative(),
            errorRate: z.number().min(0).max(1),
            averageLatencyMs: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(100),
    activeTraces: z.number().int().nonnegative(),
    incidentCount: z.number().int().nonnegative(),
  })
  .strict();
export const PortfolioAIOverviewSchema = z
  .object({
    calls: z.number().int().nonnegative(),
    successfulCalls: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1).nullable(),
    totalCostCredits: z.number().nonnegative(),
    totalInputTokens: z.number().int().nonnegative(),
    totalOutputTokens: z.number().int().nonnegative(),
    averageLatencyMs: z.number().nonnegative(),
    modelBreakdown: z
      .array(
        z
          .object({
            provider: boundedKey,
            model: z.string().min(1).max(160),
            taskClass: boundedKey,
            calls: z.number().int().nonnegative(),
            successRate: z.number().min(0).max(1).nullable(),
            averageCostPerSuccess: z.number().nonnegative().nullable(),
            averageLatencyMs: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(500),
    regressions: z
      .array(
        z
          .object({
            companyId: uuid,
            provider: boundedKey,
            model: z.string().min(1).max(160),
            taskClass: boundedKey,
            kind: z.enum(["QUALITY_DOWN", "COST_UP", "LATENCY_UP", "COMBINED"]),
            evidence: z.array(z.string().min(1).max(240)).max(20),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const PortfolioExecutiveInsightSchema = z
  .object({
    id: z.string().min(1).max(240),
    observation: z.string().min(1).max(1_000),
    evidence: z.array(z.string().min(1).max(500)).max(30),
    confidence: z.number().min(0).max(1),
    companyId: uuid,
    companyName: z.string().min(1).max(160),
    category: z.enum(["BUSINESS", "DATA", "SYSTEM", "AI", "MIXED"]),
    potentialImpact: z.string().min(1).max(500),
    suggestedNextAction: z.string().min(1).max(500),
    approvalRequired: z.boolean(),
    lineage: z.array(MetadataLineageEdgeSchema).max(200),
    traceIds: z.array(z.string().min(16).max(64)).max(100),
    aiTraceIds: z.array(uuid).max(100),
  })
  .strict();
export const OwnerPortfolioDashboardSchema = z
  .object({
    ownerId: uuid,
    generatedAt: z.iso.datetime(),
    companies: z.array(PortfolioCompanySummarySchema).max(100),
    portfolioMetrics: z.array(PortfolioMetricViewSchema).max(2_000),
    attentionQueue: z.array(PortfolioAttentionSignalSchema).max(500),
    systemHealth: PortfolioSystemOverviewSchema,
    aiHealth: PortfolioAIOverviewSchema,
    insights: z.array(PortfolioExecutiveInsightSchema).max(100),
    evidenceQuality: z.enum(["FRESH", "STALE", "CONFLICTED", "UNAVAILABLE"]),
  })
  .strict();

export const PortfolioMetricComparisonRequestSchema = z
  .object({
    canonicalMetricKey: boundedKey,
    companyIds: z.array(uuid).min(2).max(100),
    period: z.string().trim().min(1).max(120).default("LATEST"),
  })
  .strict();
export const PortfolioTraceQuerySchema = z
  .object({
    companyId: uuid.optional(),
    traceId: z.string().min(16).max(64).optional(),
    status: z.enum(["OK", "ERROR"]).optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export const PortfolioAITraceQuerySchema = z
  .object({
    companyId: uuid.optional(),
    provider: boundedKey.optional(),
    model: z.string().min(1).max(160).optional(),
    taskClass: boundedKey.optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export const PortfolioAlertActionSchema = z
  .object({
    action: z.enum(["ACKNOWLEDGE", "SNOOZE"]),
    snoozedUntil: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) => value.action !== "SNOOZE" || value.snoozedUntil,
    "Snooze requires an expiry.",
  );

export type SystemTelemetrySpan = z.infer<typeof SystemTelemetrySpanSchema>;
export type AIObservabilityTrace = z.infer<typeof AIObservabilityTraceSchema>;
export type PortfolioMetricView = z.infer<typeof PortfolioMetricViewSchema>;
export type PortfolioMetricCompatibility = z.infer<
  typeof PortfolioMetricCompatibilitySchema
>;
export type PortfolioAttentionSignal = z.infer<typeof PortfolioAttentionSignalSchema>;
export type PortfolioCompanySummary = z.infer<typeof PortfolioCompanySummarySchema>;
export type PortfolioExecutiveInsight = z.infer<typeof PortfolioExecutiveInsightSchema>;
export type OwnerPortfolioDashboard = z.infer<typeof OwnerPortfolioDashboardSchema>;
