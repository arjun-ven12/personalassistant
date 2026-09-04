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

export const PortfolioContextSchema = z.object({
  ownerId: uuid,
  mode: z.literal("PORTFOLIO"),
  selectedCompanyIds: z.array(uuid).max(100).default([]),
  activeCompanyId: optionalUuid,
  portfolioScope: z.enum(["ACTIVE", "ACTIVE_AND_PAUSED", "ALL_AUTHORIZED"]),
  authority: z.literal("OWNER"),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
}).strict();

export const PortfolioCompanyPrioritySchema = z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]);
export const PortfolioHealthStateSchema = z.enum(["HEALTHY", "WATCH", "AT_RISK", "CRITICAL", "UNKNOWN"]);

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
    score: z.number().min(0).max(100).nullable().default(null),
    weight: z.number().min(0).max(1).default(0),
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
    priority: PortfolioCompanyPrioritySchema.default("NORMAL"),
    healthScore: z.number().min(0).max(100).nullable().default(null),
    healthState: PortfolioHealthStateSchema.default("UNKNOWN"),
    health: z.array(PortfolioHealthComponentSchema).max(10),
    metrics: z.array(PortfolioMetricViewSchema).max(100),
    dataAlerts: z.number().int().nonnegative(),
    systemIncidents: z.number().int().nonnegative(),
    aiSpendCredits: z.number().nonnegative(),
    aiSuccessRate: z.number().min(0).max(1).nullable(),
    integrationHealth: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
    activeObjectives: z.number().int().nonnegative().default(0),
    atRiskObjectives: z.number().int().nonnegative().default(0),
    blockedObjectives: z.number().int().nonnegative().default(0),
    activeAgents: z.number().int().nonnegative().default(0),
    totalSpendCredits: z.number().nonnegative().default(0),
    efficiency: z.number().nonnegative().nullable().default(null),
    approvalsPending: z.number().int().nonnegative().default(0),
    criticalEvents: z.number().int().nonnegative().default(0),
    recentOutcomeTrend: z.enum(["UP", "DOWN", "FLAT", "INSUFFICIENT_DATA"]).default("INSUFFICIENT_DATA"),
    management: z.object({
      topPriority: z.string().min(1).max(500).nullable(),
      totalObjectives: z.number().int().nonnegative(),
      objectivesAtRisk: z.number().int().nonnegative(),
      blockedObjectives: z.number().int().nonnegative().default(0),
      decisionsRequiringOwner: z.number().int().nonnegative(),
      latestReviewAt: z.iso.datetime().nullable(),
      nextRecommendedFocus: z.string().min(1).max(500),
    }).strict().default({
      topPriority: null,
      totalObjectives: 0,
      objectivesAtRisk: 0,
      blockedObjectives: 0,
      decisionsRequiringOwner: 0,
      latestReviewAt: null,
      nextRecommendedFocus: "Open company management to establish priorities.",
    }),
  })
  .strict();

export const PortfolioHealthSchema = z.object({
  state: PortfolioHealthStateSchema,
  score: z.number().min(0).max(100).nullable(),
  weighting: z.literal("OWNER_PRIORITY_X_ACTIVE_OBJECTIVES"),
  companiesIncluded: z.number().int().nonnegative().max(100),
  companiesUnknown: z.number().int().nonnegative().max(100),
  evidence: z.array(z.string().min(1).max(240)).max(20),
}).strict();

export const PortfolioActivityItemSchema = z.object({
  id: z.string().min(1).max(240),
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  category: z.enum(["OBJECTIVE", "SYSTEM", "DATA", "AI", "LIFECYCLE", "APPROVAL", "RESOURCE"]),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]),
  summary: z.string().min(1).max(500),
  occurredAt: z.iso.datetime(),
  evidenceRef: z.string().min(1).max(240),
}).strict();

export const PortfolioExecutiveBriefSchema = z.object({
  generatedAt: z.iso.datetime(),
  portfolioState: PortfolioHealthStateSchema,
  summary: z.string().min(1).max(1_000),
  companyUpdates: z.array(z.object({
    companyId: uuid,
    companyName: z.string().min(1).max(160),
    state: PortfolioHealthStateSchema,
    summary: z.string().min(1).max(500),
    ownerActionRequired: z.boolean(),
  }).strict()).max(100),
  ownerAttention: z.array(PortfolioAttentionSignalSchema).max(20),
  evidenceQuality: z.enum(["FRESH", "STALE", "CONFLICTED", "UNAVAILABLE"]),
  executed: z.literal(false),
}).strict();

export const PortfolioCompanyComparisonRequestSchema = z.object({
  companyIds: z.array(uuid).min(2).max(100),
}).strict();
export const PortfolioCompanyComparisonSchema = z.object({
  generatedAt: z.iso.datetime(),
  companies: z.array(z.object({
    companyId: uuid,
    companyName: z.string().min(1).max(160),
    priority: PortfolioCompanyPrioritySchema,
    healthScore: z.number().min(0).max(100).nullable(),
    healthState: PortfolioHealthStateSchema,
    activeObjectives: z.number().int().nonnegative(),
    atRiskObjectives: z.number().int().nonnegative(),
    blockedObjectives: z.number().int().nonnegative(),
    activeAgents: z.number().int().nonnegative(),
    spendCredits: z.number().nonnegative(),
    evidenceQuality: z.enum(["FRESH", "STALE", "CONFLICTED", "UNAVAILABLE"]),
  }).strict()).min(2).max(100),
  caveats: z.array(z.string().min(1).max(500)).max(20),
  executed: z.literal(false),
}).strict();

const portfolioCredits = z.number().int().nonnegative().max(1_000_000_000);
export const PortfolioObjectiveStrategySchema = z.enum([
  "EQUAL",
  "CAPACITY_WEIGHTED",
  "PRIORITY_WEIGHTED",
]);
export const CreatePortfolioObjectiveRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(160),
  title: z.string().trim().min(1).max(240),
  desiredOutcome: z.string().trim().min(1).max(1_000),
  canonicalMetricKey: boundedKey.nullable().default(null),
  targetValue: z.string().regex(/^-?\d+(\.\d{1,12})?$/).nullable().default(null),
  unit: z.string().trim().min(1).max(40).nullable().default(null),
  deadline: z.iso.datetime().nullable().default(null),
  budgetCredits: portfolioCredits.default(0),
  strategy: PortfolioObjectiveStrategySchema.default("PRIORITY_WEIGHTED"),
  selectedCompanyIds: z.array(uuid).min(1).max(100).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
}).strict();
export const PortfolioObjectiveAllocationSchema = z.object({
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  weight: z.number().min(0).max(1),
  proposedTargetValue: z.string().regex(/^-?\d+(\.\d{1,12})?$/).nullable(),
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED", "COUNTERPROPOSED", "EXPIRED", "OWNER_DECISION_REQUIRED"]),
  reason: z.string().min(1).max(500),
  governorProposalId: uuid.nullable().default(null),
  companyObjectiveId: uuid.nullable().default(null),
}).strict();
export const PortfolioObjectiveSchema = z.object({
  id: uuid,
  ownerId: uuid,
  idempotencyKey: z.string().min(16).max(160),
  title: z.string().min(1).max(240),
  desiredOutcome: z.string().min(1).max(1_000),
  canonicalMetricKey: boundedKey.nullable(),
  targetValue: z.string().regex(/^-?\d+(\.\d{1,12})?$/).nullable(),
  unit: z.string().min(1).max(40).nullable(),
  deadline: z.iso.datetime().nullable(),
  budgetCredits: portfolioCredits.default(0),
  strategy: PortfolioObjectiveStrategySchema,
  constraints: z.array(z.string().min(1).max(240)).max(20),
  status: z.enum(["PROPOSED", "NEGOTIATING", "PARTIALLY_ACCEPTED", "ACCEPTED", "BLOCKED", "ACTIVE", "COMPLETED", "CANCELLED"]),
  allocations: z.array(PortfolioObjectiveAllocationSchema).min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  executed: z.literal(false),
}).strict();

export const PortfolioEconomyCompanySchema = z.object({
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  allocatedCredits: portfolioCredits,
  spentCredits: portfolioCredits,
  reservedCredits: portfolioCredits,
  availableCredits: portfolioCredits,
}).strict();
export const PortfolioEconomySchema = z.object({
  ownerId: uuid,
  ownerReserveAvailable: portfolioCredits,
  allocatedAcrossCompanies: portfolioCredits,
  companyAccounts: z.array(PortfolioEconomyCompanySchema).max(100),
  generatedAt: z.iso.datetime(),
}).strict();
export const PortfolioResourceTransferRequestSchema = z.object({
  companyId: uuid,
  amount: portfolioCredits.positive(),
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(16).max(200),
  approvalId: uuid.optional(),
}).strict();
export const PortfolioResourceTransferSchema = z.object({
  transferId: uuid,
  ownerId: uuid,
  companyId: uuid,
  amount: portfolioCredits.positive(),
  reason: z.string().min(1).max(240),
  idempotencyKey: z.string().min(16).max(200),
  approvalId: uuid.nullable(),
  status: z.enum(["APPROVAL_REQUIRED", "SETTLED"]),
  createdAt: z.iso.datetime(),
  settledAt: z.iso.datetime().nullable(),
}).strict();

export const OwnerReserveFundingRequestSchema = z.object({
  amount: portfolioCredits.positive(),
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(16).max(200),
  approvalId: uuid.optional(),
}).strict();
export const OwnerReserveFundingSchema = z.object({
  fundingId: uuid,
  ownerId: uuid,
  amount: portfolioCredits.positive(),
  reason: z.string().min(1).max(240),
  authority: z.literal("OWNER_RESERVE_FUND"),
  authorityRef: z.string().min(1).max(240),
  idempotencyKey: z.string().min(16).max(200),
  approvalId: uuid.nullable(),
  status: z.enum(["APPROVAL_REQUIRED", "SETTLED"]),
  createdAt: z.iso.datetime(),
  settledAt: z.iso.datetime().nullable(),
}).strict();

export const GovernorProposalTypeSchema = z.enum([
  "PORTFOLIO_OBJECTIVE_ALLOCATION",
  "RESOURCE_REQUEST",
  "PRIORITY_DIRECTIVE",
  "STRATEGY_REQUEST",
  "SERVICE_COORDINATION",
]);
export const GovernorProposalStatusSchema = z.enum([
  "CREATED", "DELIVERED", "UNDER_REVIEW", "ACCEPTED", "REJECTED",
  "COUNTERPROPOSED", "ESCALATED_TO_OWNER", "EXPIRED", "CANCELLED",
]);
export const GovernorProposalTermsSchema = z.object({
  requestedOutcome: z.string().trim().min(1).max(1_000),
  targetValue: z.string().regex(/^-?\d+(\.\d{1,12})?$/).nullable(),
  unit: z.string().min(1).max(40).nullable(),
  budgetCredits: portfolioCredits,
  deadline: z.iso.datetime().nullable(),
  constraints: z.array(z.string().min(1).max(240)).max(20),
}).strict();
export const GovernorProposalRevisionSchema = z.object({
  version: z.number().int().positive().max(10),
  proposedBy: z.enum(["PORTFOLIO", "COMPANY_GOVERNOR", "OWNER"]),
  terms: GovernorProposalTermsSchema,
  reasonCode: z.enum([
    "PORTFOLIO_PROPOSED",
    "ACCEPTED", "INSUFFICIENT_BUDGET", "INSUFFICIENT_CAPACITY",
    "CAPABILITY_UNAVAILABLE", "POLICY_DENIED", "COMPANY_PAUSED",
    "CONFLICTING_PRIORITY", "INVALID_CONSTRAINTS", "OWNER_MODIFIED",
  ]),
  explanation: z.string().max(500).nullable(),
  createdAt: z.iso.datetime(),
}).strict();
export const GovernorProposalSchema = z.object({
  id: uuid,
  ownerId: uuid,
  companyId: uuid,
  portfolioObjectiveId: uuid.nullable(),
  sourceGovernorId: z.literal("portfolio_coordinator"),
  targetGovernorAssignmentId: uuid.nullable(),
  proposalType: GovernorProposalTypeSchema,
  status: GovernorProposalStatusSchema,
  revisions: z.array(GovernorProposalRevisionSchema).min(1).max(10),
  maxCounterproposalRounds: z.number().int().min(1).max(5),
  idempotencyKey: z.string().min(16).max(200),
  companyObjectiveId: uuid.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  decisionIdempotencyKeys: z.array(z.string().min(16).max(200)).max(20).default([]),
  leaseOwner: z.string().min(1).max(200).nullable().default(null),
  leaseAcquiredAt: z.iso.datetime().nullable().default(null),
  leaseExpiresAt: z.iso.datetime().nullable().default(null),
  leaseGeneration: z.number().int().nonnegative().default(0),
  attemptCount: z.number().int().nonnegative().max(100).default(0),
}).strict();
export const GovernorProposalDecisionRequestSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT", "COUNTERPROPOSE"]),
  reasonCode: GovernorProposalRevisionSchema.shape.reasonCode,
  explanation: z.string().trim().max(500).nullable().default(null),
  counterTerms: GovernorProposalTermsSchema.optional(),
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict().superRefine((value, context) => {
  if (value.decision === "COUNTERPROPOSE" && !value.counterTerms)
    context.addIssue({ code: "custom", path: ["counterTerms"], message: "Counterproposal terms are required." });
});

export const PortfolioSearchTypeSchema = z.enum([
  "COMPANY", "OBJECTIVE", "AGENT", "WORKFLOW", "APPROVAL", "EXPERIMENT",
]);
export const PortfolioSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(120),
  type: z.enum(["ALL", "COMPANIES", "OBJECTIVES", "AGENTS", "WORKFLOWS", "APPROVALS", "EXPERIMENTS"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();
export const PortfolioSearchResultSchema = z.object({
  type: PortfolioSearchTypeSchema,
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  subtitle: z.string().min(1).max(300),
  status: z.string().min(1).max(80),
  deepLink: z.string().startsWith("/").max(500),
}).strict();
export const PortfolioSearchResponseSchema = z.object({
  query: z.string().min(1).max(120),
  results: z.array(PortfolioSearchResultSchema).max(100),
  truncated: z.boolean(),
}).strict();

export const PortfolioApprovalRowSchema = z.object({
  id: uuid,
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  action: z.string().min(1).max(300),
  risk: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
  requestingActor: z.string().min(1).max(160),
  objectiveId: z.string().max(160).nullable(),
  expectedCostCredits: portfolioCredits.nullable(),
  createdAt: z.iso.datetime(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED", "CONSUMED"]),
  deepLink: z.string().startsWith("/").max(500),
}).strict();
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
    context: PortfolioContextSchema,
    health: PortfolioHealthSchema,
    companies: z.array(PortfolioCompanySummarySchema).max(100),
    portfolioMetrics: z.array(PortfolioMetricViewSchema).max(2_000),
    attentionQueue: z.array(PortfolioAttentionSignalSchema).max(500),
    systemHealth: PortfolioSystemOverviewSchema,
    aiHealth: PortfolioAIOverviewSchema,
    insights: z.array(PortfolioExecutiveInsightSchema).max(100),
    activity: z.array(PortfolioActivityItemSchema).max(100),
    capabilities: z.array(z.enum([
      "LIST_COMPANIES", "GET_PORTFOLIO_SUMMARY", "COMPARE_COMPANIES",
      "GET_COMPANY_HEALTH", "OPEN_COMPANY", "SET_COMPANY_PRIORITY",
      "CREATE_PORTFOLIO_OBJECTIVE", "PAUSE_COMPANY", "RESUME_COMPANY",
    ])).max(20),
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
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();
export const PortfolioAITraceQuerySchema = z
  .object({
    companyId: uuid.optional(),
    provider: boundedKey.optional(),
    model: z.string().min(1).max(160).optional(),
    taskClass: boundedKey.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
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
export type PortfolioContext = z.infer<typeof PortfolioContextSchema>;
export type PortfolioHealth = z.infer<typeof PortfolioHealthSchema>;
export type PortfolioExecutiveBrief = z.infer<typeof PortfolioExecutiveBriefSchema>;
export type PortfolioCompanyComparison = z.infer<typeof PortfolioCompanyComparisonSchema>;
export type PortfolioObjective = z.infer<typeof PortfolioObjectiveSchema>;
export type PortfolioEconomy = z.infer<typeof PortfolioEconomySchema>;
export type PortfolioResourceTransfer = z.infer<typeof PortfolioResourceTransferSchema>;
export type OwnerReserveFunding = z.infer<typeof OwnerReserveFundingSchema>;
export type OwnerReserveFundingRequest = z.infer<typeof OwnerReserveFundingRequestSchema>;
export type GovernorProposal = z.infer<typeof GovernorProposalSchema>;
export type GovernorProposalDecisionRequest = z.infer<typeof GovernorProposalDecisionRequestSchema>;
export type PortfolioSearchRequest = z.infer<typeof PortfolioSearchRequestSchema>;
export type PortfolioSearchResult = z.infer<typeof PortfolioSearchResultSchema>;
export type PortfolioApprovalRow = z.infer<typeof PortfolioApprovalRowSchema>;
export type PortfolioExecutiveInsight = z.infer<typeof PortfolioExecutiveInsightSchema>;
export type OwnerPortfolioDashboard = z.infer<typeof OwnerPortfolioDashboardSchema>;
