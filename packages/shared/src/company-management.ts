import { z } from "zod";

import { MetadataLineageEdgeSchema } from "./company-data.js";

const uuid = z.string().uuid();
const bounded = z.string().trim().min(1).max(500);

export const ManagementRootCauseCategorySchema = z.enum([
  "BUSINESS_PERFORMANCE", "DATA_QUALITY", "EXECUTION", "WORKFORCE",
  "CAPABILITY", "INTEGRATION", "BUDGET", "SYSTEM", "AI_QUALITY", "POLICY",
  "EXTERNAL_UNKNOWN",
]);
export const ManagementEvidenceStateSchema = z.enum(["OBSERVED", "LIKELY", "POSSIBLE", "UNVERIFIED"]);
export const ManagementKpiStatusSchema = z.enum(["ON_TRACK", "WATCH", "AT_RISK", "CRITICAL", "UNKNOWN"]);
export const ObjectiveRisk25_7Schema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);

export const CompanyManagementKpiSchema = z.object({
  metricId: uuid,
  canonicalKey: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  value: z.string().nullable(),
  target: z.number().nullable(),
  unit: z.string().max(40),
  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "TARGET_RANGE", "BINARY"]).nullable(),
  trend: z.enum(["UP", "DOWN", "FLAT", "INSUFFICIENT_DATA"]),
  status: ManagementKpiStatusSchema,
  freshness: z.enum(["CURRENT", "STALE", "UNAVAILABLE", "CONFLICT"]),
  ownerDepartmentId: uuid.nullable(),
  definitionVersion: z.number().int().positive(),
  lineage: z.array(MetadataLineageEdgeSchema).max(200),
}).strict();

export const ManagementForecastSchema = z.object({
  metricId: uuid,
  method: z.enum(["LINEAR_TREND", "RUN_RATE", "INSUFFICIENT_DATA"]),
  projectedLow: z.number().nullable(),
  projectedHigh: z.number().nullable(),
  target: z.number().nullable(),
  outcome: z.enum(["LIKELY_MEET", "LIKELY_MISS", "UNCERTAIN", "UNKNOWN"]),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  freshness: z.enum(["CURRENT", "STALE", "UNAVAILABLE", "CONFLICT"]),
  limitations: z.array(bounded).max(10),
}).strict();

export const ManagementObjectiveHealthSchema = z.object({
  objectiveId: uuid,
  title: z.string().min(1).max(160),
  status: z.string().min(1).max(40),
  risk: ObjectiveRisk25_7Schema,
  recommendation: z.enum(["CONTINUE", "MODIFY", "PAUSE", "STOP", "REPLAN", "OWNER_REVIEW"]),
  components: z.object({
    progress: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    schedule: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    budget: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    execution: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    quality: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    dataConfidence: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
  }).strict(),
  progressPercent: z.number().min(0).max(100),
  timeElapsedPercent: z.number().min(0).max(100).nullable(),
  budgetConsumedPercent: z.number().min(0).max(10_000),
  evidence: z.array(bounded).max(30),
}).strict();

export const ManagementDiagnosisSchema = z.object({
  id: z.string().min(1).max(240),
  category: ManagementRootCauseCategorySchema,
  evidenceState: ManagementEvidenceStateSchema,
  summary: bounded,
  evidenceRefs: z.array(z.string().min(1).max(240)).max(40),
  actionPath: z.enum(["DATA", "INTEGRATIONS", "OBJECTIVE", "WORKFORCE", "APPROVALS", "SERVICES", "SYSTEM", "AI", "NONE"]),
}).strict();

export const ManagementStrategySchema = z.object({
  objectiveId: uuid.nullable(),
  strategicIntent: bounded,
  assumptions: z.array(bounded).max(30),
  priorities: z.array(bounded).max(30),
  constraints: z.array(bounded).max(30),
  successMetricIds: z.array(uuid).max(30),
  initiatives: z.array(bounded).max(50),
  budgetEnvelope: z.number().int().nonnegative().nullable(),
  timeHorizon: z.string().min(1).max(80),
  version: z.number().int().positive(),
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "COMPLETED", "UNAVAILABLE"]),
}).strict();

export const CompanyManagementReviewSchema = z.object({
  id: uuid,
  ownerId: uuid,
  companyId: uuid,
  period: z.string().min(1).max(120),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "AD_HOC"]),
  strategyVersion: z.number().int().positive().nullable(),
  companyState: z.enum(["HEALTHY", "WATCH", "AT_RISK", "CRITICAL", "UNKNOWN"]),
  kpiStatus: z.array(CompanyManagementKpiSchema).max(100),
  objectiveStatus: z.array(ManagementObjectiveHealthSchema).max(500),
  risks: z.array(ManagementDiagnosisSchema).max(100),
  opportunities: z.array(bounded).max(50),
  recommendations: z.array(bounded).max(50),
  decisionsNeeded: z.array(bounded).max(50),
  evidenceRefs: z.array(z.string().min(1).max(240)).max(200),
  generatedAt: z.iso.datetime(),
  executed: z.literal(false),
}).strict();

export const CompanyManagementDashboardSchema = z.object({
  ownerId: uuid,
  companyId: uuid,
  companyName: z.string().min(1).max(160),
  generatedAt: z.iso.datetime(),
  health: z.enum(["HEALTHY", "WATCH", "AT_RISK", "CRITICAL", "UNKNOWN"]),
  strategy: ManagementStrategySchema.nullable(),
  kpis: z.array(CompanyManagementKpiSchema).max(100),
  forecasts: z.array(ManagementForecastSchema).max(100),
  objectives: z.array(ManagementObjectiveHealthSchema).max(500),
  diagnoses: z.array(ManagementDiagnosisSchema).max(100),
  departments: z.array(z.object({
    id: z.string().min(1).max(160), name: z.string().min(1).max(160),
    objectiveCount: z.number().int().nonnegative(), kpiCount: z.number().int().nonnegative(),
    activeAgents: z.number().int().nonnegative(), availableCredits: z.number().int().nonnegative(),
    risks: z.array(bounded).max(20),
  }).strict()).max(100),
  latestReview: CompanyManagementReviewSchema.nullable(),
  decisions: z.array(z.object({
    id: uuid, question: bounded, alternatives: z.array(bounded).min(2).max(10),
    selectedOption: bounded.nullable(), expectedOutcome: bounded.nullable(), actualOutcome: bounded.nullable(),
    status: z.string().min(1).max(40), evidence: z.array(bounded).max(40), updatedAt: z.iso.datetime(),
  }).strict()).max(100),
  executiveBrief: z.object({
    topPriorities: z.array(bounded).max(10), topRisks: z.array(bounded).max(10),
    objectivesAtRisk: z.number().int().nonnegative(), budgetAlerts: z.number().int().nonnegative(),
    actionsRequiringOwner: z.array(bounded).max(20),
  }).strict(),
  invariants: z.object({
    evidenceFirst: z.literal(true), canonicalMetricsAuthoritative: z.literal(true),
    recommendationsExecuteWork: z.literal(false), lowerPolicyMayWiden: z.literal(false),
  }).strict(),
}).strict();

export const GenerateManagementReviewRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200),
  cadence: CompanyManagementReviewSchema.shape.cadence.default("AD_HOC"),
  period: z.string().trim().min(1).max(120).default("CURRENT"),
}).strict();

export type CompanyManagementDashboard = z.infer<typeof CompanyManagementDashboardSchema>;
export type CompanyManagementReview = z.infer<typeof CompanyManagementReviewSchema>;
