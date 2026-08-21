import { z } from "zod";

export const ReflectionScopeSchema = z.enum([
  "GOAL",
  "OBJECTIVE",
  "PROJECT",
  "PLAN",
  "PLAN_VERSION",
  "DECISION",
  "TASK",
  "WORKFLOW",
  "AGENT_RUN",
  "KPI",
  "RISK",
  "EXECUTIVE_RECOMMENDATION",
  "CUSTOM_PERIOD",
]);
export const ReflectionTypeSchema = z.enum([
  "PLAN_RETROSPECTIVE",
  "DECISION_RETROSPECTIVE",
  "GOAL_REVIEW",
  "PROJECT_RETROSPECTIVE",
  "ESTIMATE_CALIBRATION",
  "ASSUMPTION_REVIEW",
  "FAILURE_ANALYSIS",
  "SUCCESS_ANALYSIS",
  "RECOMMENDATION_REVIEW",
  "RISK_RETROSPECTIVE",
  "PERIODIC_REVIEW",
  "ROUTING_REVIEW",
  "COST_EFFECTIVENESS_REVIEW",
  "CONFIDENCE_CALIBRATION",
]);
export const ReflectionOutcomeSchema = z.enum([
  "EXCEEDED_EXPECTATION",
  "MET_EXPECTATION",
  "PARTIALLY_MET",
  "MISSED",
  "INCONCLUSIVE",
  "NOT_ADOPTED",
]);
export const MitigationEvaluationSchema = z
  .object({
    execution: z.enum(["PLANNED", "EXECUTED", "NOT_EXECUTED", "PARTIALLY_EXECUTED"]),
    effectiveness: z.enum(["PREVENTED", "REDUCED", "FAILED", "INCONCLUSIVE"]),
    credited: z.boolean(),
  })
  .strict();
export const RecommendationEvaluationSchema = z
  .object({
    made: z.boolean(),
    disposition: z.enum(["ADOPTED", "IGNORED", "SUPERSEDED", "PENDING"]),
    implemented: z.boolean(),
    outcomeObservable: z.boolean(),
    result: z.enum(["SUCCEEDED", "FAILED", "NOT_ADOPTED", "INCONCLUSIVE"]),
  })
  .strict();
export const ReflectionEvidenceSchema = z
  .object({
    type: z.string().min(1).max(80),
    sourceId: z.string().min(1).max(240),
    sourceType: z.string().min(1).max(80),
    timestamp: z.iso.datetime(),
    description: z.string().max(500),
    authority: z.enum([
      "DURABLE_STATE",
      "SYSTEM_RECORD",
      "ACCEPTED_DECISION",
      "OWNER_CORRECTION",
      "MEMORY",
      "MODEL_INFERENCE",
    ]),
  })
  .strict();
export const ReflectionMetricSchema = z
  .object({
    name: z.string().max(80),
    expected: z.number().nullable(),
    actual: z.number().nullable(),
    unit: z.string().max(40),
    variance: z.number().nullable(),
    variancePercent: z.number().nullable(),
  })
  .strict();
export const AssumptionEvaluationSchema = z
  .object({
    assumption: z.string().max(500),
    status: z.enum([
      "CONFIRMED",
      "PARTIALLY_TRUE",
      "FALSE",
      "UNKNOWN",
      "NO_LONGER_RELEVANT",
    ]),
    evidenceIds: z.array(z.string().max(240)).max(20),
  })
  .strict();
export const ReflectionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    scopeType: ReflectionScopeSchema,
    scopeId: z.string().max(240),
    reflectionType: ReflectionTypeSchema,
    status: z.enum(["DRAFT", "FINAL", "REVISED", "SUPERSEDED", "DISMISSED"]),
    previousVersionId: z.string().uuid().nullable(),
    baselineVersion: z.string().max(80).nullable(),
    snapshotDigest: z.string().min(16).max(128),
    periodStart: z.iso.datetime().nullable(),
    periodEnd: z.iso.datetime().nullable(),
    outcome: ReflectionOutcomeSchema,
    expectedState: z.record(z.string().max(120), z.json()).default({}),
    actualState: z.record(z.string().max(120), z.json()).default({}),
    deviations: z.array(z.string().max(500)).max(100).default([]),
    metrics: z.array(ReflectionMetricSchema).max(100),
    successes: z.array(z.string().max(500)).max(50),
    failures: z.array(z.string().max(500)).max(50),
    contributingFactors: z.array(z.string().max(500)).max(50).default([]),
    assumptions: z.array(AssumptionEvaluationSchema).max(50),
    rootCauses: z
      .array(
        z
          .object({
            category: z.enum([
              "ESTIMATE_ERROR",
              "DEPENDENCY_DELAY",
              "SCOPE_CHANGE",
              "TECHNICAL_FAILURE",
              "RESOURCE_CONSTRAINT",
              "EXTERNAL_DEPENDENCY",
              "MISSING_INFORMATION",
              "INCORRECT_ASSUMPTION",
              "PRIORITY_CHANGE",
              "EXECUTION_FAILURE",
              "PLAN_STRUCTURE",
              "DECISION_ERROR",
              "UNANTICIPATED_RISK",
              "UNKNOWN",
            ]),
            description: z.string().max(500),
            confidence: z.number().min(0).max(1),
            evidenceIds: z.array(z.string().max(240)).max(20),
            alternativeExplanations: z.array(z.string().max(500)).max(10),
          })
          .strict(),
      )
      .max(20),
    lessons: z.array(z.string().max(500)).max(30),
    recommendations: z.array(z.string().max(500)).max(30),
    mitigationEvaluation: MitigationEvaluationSchema.nullable().default(null),
    recommendationEvaluation: RecommendationEvaluationSchema.nullable().default(null),
    evidence: z.array(ReflectionEvidenceSchema).max(200),
    confidence: z.number().min(0).max(1),
    source: z.enum(["DETERMINISTIC", "MODEL_ASSISTED", "USER_CORRECTED"]),
    createdBy: z.enum(["SYSTEM", "OWNER"]).default("SYSTEM"),
    providerId: z.string().max(80).nullable(),
    modelId: z.string().max(160).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const ReflectionPatternSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    type: z.string().max(80),
    description: z.string().max(500),
    evidenceCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
    firstObserved: z.iso.datetime(),
    lastObserved: z.iso.datetime(),
    confidence: z.number().min(0).max(1),
    trend: z.enum(["STRENGTHENING", "STABLE", "WEAKENING"]),
    linkedEntityIds: z.array(z.string().max(240)).max(100),
    reflectionIds: z.array(z.string().uuid()).max(100),
    status: z.enum(["CANDIDATE", "SUPPORTED", "WEAKENED", "SUPERSEDED", "DISMISSED"]),
  })
  .strict();
export const ReflectionCalibrationSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    category: z.string().max(120),
    metricType: z.enum(["ESTIMATE", "CONFIDENCE"]).default("ESTIMATE"),
    scope: z
      .object({
        taskType: z.string().max(120).nullable().default(null),
        projectId: z.string().max(240).nullable().default(null),
        workflowId: z.string().max(240).nullable().default(null),
        agentId: z.string().max(240).nullable().default(null),
        estimateSource: z.string().max(120).nullable().default(null),
        complexityBand: z.string().max(80).nullable().default(null),
      })
      .strict()
      .default({
        taskType: null,
        projectId: null,
        workflowId: null,
        agentId: null,
        estimateSource: null,
        complexityBand: null,
      }),
    sampleCount: z.number().int().nonnegative(),
    minimumSampleCount: z.number().int().positive().default(3),
    status: z.enum(["CALIBRATED", "INSUFFICIENT_DATA"]).default("INSUFFICIENT_DATA"),
    meanEstimate: z.number(),
    meanActual: z.number(),
    biasPercent: z.number(),
    meanAbsoluteError: z.number(),
    confidence: z.number().min(0).max(1),
    trend: z.enum(["UNDER_ESTIMATING", "OVER_ESTIMATING", "STABLE", "INSUFFICIENT_DATA"]).default("INSUFFICIENT_DATA"),
    fallbackLevel: z.enum(["EXACT", "TASK_TYPE_PROJECT", "TASK_TYPE", "PROJECT", "GLOBAL", "NONE"]).default("NONE"),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ReflectionQuerySchema = z
  .object({
    type: z.enum([
      "RETROSPECTIVE",
      "WHY_FAILED",
      "WHY_SUCCEEDED",
      "EVALUATE_DECISION",
      "EVALUATE_PLAN",
      "EVALUATE_ESTIMATE",
      "EVALUATE_RISK",
      "EVALUATE_GOAL",
      "EVALUATE_KPI",
      "FIND_PATTERNS",
      "WEEKLY_REVIEW",
      "CALIBRATION",
    ]),
    scope: ReflectionScopeSchema,
    entityId: z.string().max(240).nullable().default(null),
    periodStart: z.iso.datetime().nullable().default(null),
    periodEnd: z.iso.datetime().nullable().default(null),
    requestedDepth: z.enum(["BRIEF", "STANDARD", "DEEP"]).default("STANDARD"),
  })
  .strict();
export const ReflectionFeedbackRequestSchema = z
  .object({
    feedback: z.enum([
      "HELPFUL",
      "WRONG_CONCLUSION",
      "WRONG_CAUSE",
      "MISSING_EVIDENCE",
      "NOT_USEFUL",
    ]),
    correction: z.string().min(1).max(1_000).nullable().default(null),
    evidenceSourceId: z.string().min(1).max(240).nullable().default(null),
  })
  .strict();
export const ReflectionEngineResponseSchema = z
  .object({
    query: ReflectionQuerySchema,
    text: z.string().min(1).max(5000),
    reflection: ReflectionRecordSchema.nullable(),
    patterns: z.array(ReflectionPatternSchema),
    calibrations: z.array(ReflectionCalibrationSchema),
    executed: z.literal(false),
  })
  .strict();
export const ReflectionDashboardSchema = z
  .object({
    reflections: z.array(ReflectionRecordSchema),
    patterns: z.array(ReflectionPatternSchema),
    calibrations: z.array(ReflectionCalibrationSchema),
    routingEconomics: z
      .array(
        z
          .object({
            route: z.enum(["PRECODED", "GEMMA", "GPT", "GEMMA_TO_GPT"]),
            sampleCount: z.number().int().nonnegative(),
            successRate: z.number().min(0).max(1).nullable(),
            clarificationRate: z.number().min(0).max(1).nullable(),
            meanLatencyMs: z.number().nonnegative().nullable(),
            totalCostUsd: z.number().nonnegative(),
            costPerSuccessfulOutcome: z.number().nonnegative().nullable(),
            positiveFeedbackRate: z.number().min(0).max(1).nullable(),
            correctionRate: z.number().min(0).max(1).nullable(),
          })
          .strict(),
      )
      .max(4)
      .default([]),
    summary: z
      .object({
        evaluated: z.number().int().nonnegative(),
        met: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        missed: z.number().int().nonnegative(),
        inconclusive: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type ReflectionRecord = z.infer<typeof ReflectionRecordSchema>;
export type ReflectionPattern = z.infer<typeof ReflectionPatternSchema>;
export type ReflectionCalibration = z.infer<typeof ReflectionCalibrationSchema>;
export type ReflectionQuery = z.infer<typeof ReflectionQuerySchema>;
