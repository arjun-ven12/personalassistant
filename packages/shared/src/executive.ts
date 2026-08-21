import { z } from "zod";

export const ExecutiveGoalStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "AT_RISK",
  "COMPLETED",
  "CANCELLED",
]);
export const ExecutivePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const ExecutiveQueryTypeSchema = z.enum([
  "PRIORITIZE",
  "PLAN",
  "ASSESS_PROGRESS",
  "ASSESS_RISK",
  "COMPARE_OPTIONS",
  "RECOMMEND",
  "SCHEDULE",
  "REVIEW_KPI",
  "IDENTIFY_BLOCKERS",
  "NEXT_ACTIONS",
  "BRIEF",
  "CHANGES",
  "SIMULATE",
]);
export const ExecutiveHorizonSchema = z.enum([
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "CUSTOM",
  "LONG_TERM",
]);
export const ExecutivePriorityTierSchema = z.enum([
  "DO_NOW",
  "DO_NEXT",
  "SCHEDULE",
  "WAITING",
  "DEFER",
  "DROP",
]);
export const ExecutiveHealthSchema = z.enum([
  "ON_TRACK",
  "AT_RISK",
  "BLOCKED",
  "OFF_TRACK",
  "UNKNOWN",
]);
export const ExecutiveRiskStatusSchema = z.enum([
  "OPEN",
  "MONITORING",
  "MITIGATED",
  "MATERIALIZED",
  "RESOLVED",
  "DISMISSED",
]);
export const ExecutiveDecisionStatusSchema = z.enum([
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
  "IMPLEMENTED",
]);

export const ExecutiveGoalSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().max(1_000),
    status: ExecutiveGoalStatusSchema,
    priority: ExecutivePrioritySchema,
    targetDate: z.iso.datetime().nullable(),
    startDate: z.iso.datetime().nullable(),
    successCriteria: z.array(z.string().max(500)).max(30),
    linkedTaskIds: z.array(z.string().uuid()).max(100),
    constraints: z.array(z.string().max(500)).max(30),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const ExecutiveKpiSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goalId: z.string().uuid().nullable(),
    name: z.string().min(1).max(120),
    unit: z.string().min(1).max(40),
    target: z.number(),
    currentValue: z.number(),
    direction: z.enum([
      "HIGHER_IS_BETTER",
      "LOWER_IS_BETTER",
      "TARGET_RANGE",
      "BINARY",
    ]),
    period: z.string().max(80),
    source: z.enum(["MANUAL", "TASK_SYSTEM", "WORKFLOW", "CALCULATED", "INFERRED"]),
    confidence: z.number().min(0).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ExecutiveObjectiveSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goalId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().max(1_000).nullable(),
    status: ExecutiveGoalStatusSchema,
    targetDate: z.iso.datetime().nullable(),
    metric: z.string().max(120).nullable(),
    targetValue: z.number().nullable(),
    currentValue: z.number().nullable(),
    progress: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    taskIds: z.array(z.string().uuid()).max(100),
    kpiId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const ExecutiveRiskSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goalId: z.string().uuid().nullable(),
    objectiveId: z.string().uuid().nullable(),
    planId: z.string().uuid().nullable(),
    description: z.string().min(1).max(1_000),
    likelihood: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
    severity: z.number().min(0).max(1),
    status: ExecutiveRiskStatusSchema,
    mitigation: z.string().max(1_000).nullable(),
    mitigationExecution: z
      .enum(["PLANNED", "EXECUTED", "NOT_EXECUTED", "PARTIALLY_EXECUTED"])
      .default("PLANNED"),
    mitigationEffect: z
      .enum(["PREVENTED", "REDUCED", "FAILED", "INCONCLUSIVE"])
      .default("INCONCLUSIVE"),
    source: z.enum(["MANUAL", "DETERMINISTIC", "WORKFLOW", "KPI"]),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const ExecutiveFactorSchema = z
  .object({
    name: z.string().max(80),
    value: z.number().min(-1).max(1),
    reason: z.string().max(300),
  })
  .strict();
export const ExecutiveRecommendationSchema = z
  .object({
    taskId: z.string().uuid().nullable(),
    title: z.string().min(1).max(255),
    tier: ExecutivePriorityTierSchema,
    score: z.number().min(0).max(100),
    estimatedMinutes: z.number().int().positive().nullable(),
    reasons: z.array(z.string().max(300)).max(10),
    factors: z.array(ExecutiveFactorSchema).max(12),
    goalId: z.string().uuid().nullable(),
  })
  .strict();
export const ExecutivePlanSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goalId: z.string().uuid().nullable(),
    version: z.number().int().positive(),
    previousVersionId: z.string().uuid().nullable().default(null),
    changeReason: z.string().max(1_000).nullable().default(null),
    changedAssumptions: z.array(z.string().max(500)).max(30).default([]),
    tasksAdded: z.array(z.string().uuid()).max(100).default([]),
    tasksRemoved: z.array(z.string().uuid()).max(100).default([]),
    tasksMoved: z.array(z.string().uuid()).max(100).default([]),
    deadlineChange: z
      .object({ from: z.iso.datetime().nullable(), to: z.iso.datetime().nullable() })
      .strict()
      .nullable()
      .default(null),
    constraintChanges: z.array(z.string().max(500)).max(30).default([]),
    expectedCompletionAt: z.iso.datetime().nullable().default(null),
    expectedKpis: z.record(z.string(), z.number()).default({}),
    horizon: ExecutiveHorizonSchema,
    status: z.enum(["ACTIVE", "SUPERSEDED", "CANCELLED", "COMPLETED"]),
    feasibility: z.enum(["FEASIBLE", "AT_RISK", "INFEASIBLE"]).default("FEASIBLE"),
    assumptions: z.array(z.string().max(500)).max(30),
    milestones: z.array(z.string().max(500)).max(50),
    taskIds: z.array(z.string().uuid()).max(100),
    priorityOrder: z.array(z.string().uuid()).max(100).default([]),
    effortMinutes: z.number().int().nonnegative().default(0),
    scheduleSuggestions: z
      .array(
        z
          .object({
            taskId: z.string().uuid(),
            startMinute: z.number().int().nonnegative(),
            durationMinutes: z.number().int().positive(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    unscheduledTaskIds: z.array(z.string().uuid()).max(100).default([]),
    risks: z.array(z.string().max(500)).max(30),
    feasibilityReasons: z.array(z.string().max(500)).max(30).default([]),
    checkpoints: z.array(z.string().max(500)).max(30),
    confidence: z.number().min(0).max(1).default(0.5),
    feasible: z.boolean(),
    feasibilityReason: z.string().max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ExecutiveDecisionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    question: z.string().min(1).max(1_000),
    options: z.array(z.string().max(500)).min(2).max(10),
    criteria: z.array(z.string().max(200)).max(20),
    constraints: z.array(z.string().max(500)).max(20).default([]),
    evidence: z.array(z.string().max(500)).max(40).default([]),
    tradeoffs: z.array(z.string().max(500)).max(40).default([]),
    risks: z.array(z.string().max(500)).max(20).default([]),
    optionScores: z.record(z.string(), z.number()).default({}),
    recommendation: z.string().max(500),
    confidence: z.number().min(0).max(1),
    assumptions: z.array(z.string().max(500)).max(20),
    status: ExecutiveDecisionStatusSchema,
    reversible: z.enum(["REVERSIBLE", "PARTIALLY_REVERSIBLE", "HARD_TO_REVERSE"]),
    goalId: z.string().uuid().nullable(),
    linkedProjectId: z.string().uuid().nullable().default(null),
    linkedPlanId: z.string().uuid().nullable().default(null),
    chosenOption: z.string().max(500).nullable().default(null),
    expectedOutcome: z.string().max(1_000).nullable().default(null),
    actualOutcome: z.string().max(1_000).nullable().default(null),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ExecutiveHistorySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    type: z.enum([
      "PRIORITY_EVALUATED",
      "PLAN_CREATED",
      "PLAN_REVISED",
      "HEALTH_EVALUATED",
      "KPI_REVIEWED",
      "RISK_CHANGED",
      "DECISION_PROPOSED",
      "DECISION_CHANGED",
      "ALERT_CREATED",
    ]),
    entityId: z.string().uuid().nullable(),
    summary: z.string().max(1_000),
    metadata: z.record(z.string().max(80), z.json()),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const ExecutiveAlertSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    dedupeKey: z.string().min(1).max(240),
    severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
    title: z.string().max(255),
    reason: z.string().max(1_000),
    acknowledgedAt: z.iso.datetime().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    cooldownUntil: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ExecutiveDashboardSchema = z
  .object({
    goals: z.array(ExecutiveGoalSchema),
    objectives: z.array(ExecutiveObjectiveSchema),
    kpis: z.array(ExecutiveKpiSchema),
    risks: z.array(ExecutiveRiskSchema),
    plans: z.array(ExecutivePlanSchema),
    decisions: z.array(ExecutiveDecisionSchema),
    history: z.array(ExecutiveHistorySchema),
    alerts: z.array(ExecutiveAlertSchema),
    priorities: z.array(ExecutiveRecommendationSchema),
    blockers: z.array(z.string()),
    health: ExecutiveHealthSchema,
  })
  .strict();
export const ExecutiveQuerySchema = z
  .object({
    type: ExecutiveQueryTypeSchema,
    horizon: ExecutiveHorizonSchema.default("TODAY"),
    target: z.string().max(160).nullable().default(null),
    availableMinutes: z.number().int().positive().max(1_440).nullable().default(null),
    options: z.array(z.string().max(300)).max(10).default([]),
    simulation: z.boolean().default(false),
  })
  .strict();
export const ExecutiveResponseSchema = z
  .object({
    query: ExecutiveQuerySchema,
    text: z.string().min(1).max(5_000),
    recommendations: z.array(ExecutiveRecommendationSchema).max(50),
    health: ExecutiveHealthSchema.nullable(),
    blockers: z.array(z.string().max(500)).max(50),
    plan: ExecutivePlanSchema.nullable(),
    decision: ExecutiveDecisionSchema.nullable(),
    executed: z.literal(false),
    traceId: z.string().uuid(),
  })
  .strict();

export type ExecutiveGoal = z.infer<typeof ExecutiveGoalSchema>;
export type ExecutiveKpi = z.infer<typeof ExecutiveKpiSchema>;
export type ExecutiveObjective = z.infer<typeof ExecutiveObjectiveSchema>;
export type ExecutiveRisk = z.infer<typeof ExecutiveRiskSchema>;
export type ExecutiveRecommendation = z.infer<typeof ExecutiveRecommendationSchema>;
export type ExecutivePlan = z.infer<typeof ExecutivePlanSchema>;
export type ExecutiveDecision = z.infer<typeof ExecutiveDecisionSchema>;
export type ExecutiveQuery = z.infer<typeof ExecutiveQuerySchema>;
export type ExecutiveResponse = z.infer<typeof ExecutiveResponseSchema>;
export type ExecutiveHistory = z.infer<typeof ExecutiveHistorySchema>;
export type ExecutiveAlert = z.infer<typeof ExecutiveAlertSchema>;
