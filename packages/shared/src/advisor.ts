import { z } from "zod";

export const EngineeringPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const EngineeringGoalStatusSchema = z.enum([
  "proposed",
  "planned",
  "active",
  "blocked",
  "completed",
  "cancelled",
]);

export const EngineeringSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const RecommendationCategorySchema = z.enum([
  "architecture",
  "performance",
  "security",
  "infrastructure",
  "testing",
  "documentation",
  "refactoring",
  "developer_experience",
  "reliability",
  "cost_optimisation",
]);

export const EngineeringRiskCategorySchema = z.enum([
  "security",
  "performance",
  "maintainability",
  "scalability",
  "availability",
  "compliance",
  "testing",
  "deployment",
  "technical_debt",
  "business_impact",
]);

export const ReleaseReadinessStatusSchema = z.enum(["ready", "needs_work", "blocked"]);

export const AdvisorEvidenceSchema = z
  .object({
    sourceType: z.enum([
      "repository",
      "architecture",
      "workflow",
      "validation",
      "memory",
      "decision",
      "agent",
      "integration",
      "manual",
    ]),
    reference: z.string().min(1).max(500),
    summary: z.string().min(1).max(1_000),
    observedAt: z.iso.datetime(),
  })
  .strict();

const ScoreSchema = z.number().min(0).max(100);

export const EngineeringGoalRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string().max(2_000),
    priority: EngineeringPrioritySchema,
    status: EngineeringGoalStatusSchema,
    dependencies: z.array(z.string().uuid()).max(50),
    estimatedEffort: z.string().min(1).max(120),
    risks: z.array(z.string().min(1).max(500)).max(50),
    affectedRepositoryIds: z.array(z.string().uuid()).max(100),
    completionPercent: z.number().int().min(0).max(100),
    owner: z.string().min(1).max(255),
    linkedWorkflowIds: z.array(z.string().uuid()).max(100),
    rationale: z.string().min(1).max(2_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const StrategicPlanRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goalId: z.string().uuid(),
    architecturePlan: z.string().min(1).max(4_000),
    implementationPhases: z
      .array(
        z
          .object({
            title: z.string().min(1).max(160),
            objective: z.string().min(1).max(1_000),
            dependencies: z.array(z.string().min(1).max(160)).max(20),
            approvalCheckpoint: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    milestones: z.array(z.string().min(1).max(500)).max(50),
    repositoryImpact: z.array(z.string().min(1).max(500)).max(100),
    testingStrategy: z.string().min(1).max(2_000),
    deploymentStrategy: z.string().min(1).max(2_000),
    rollbackStrategy: z.string().min(1).max(2_000),
    documentationTasks: z.array(z.string().min(1).max(500)).max(50),
    riskAnalysis: z.array(z.string().min(1).max(500)).max(50),
    approvalCheckpoints: z.array(z.string().min(1).max(500)).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TechnicalDebtRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(2_000),
    severity: EngineeringSeveritySchema,
    location: z.string().max(500),
    estimatedEffort: z.string().min(1).max(120),
    businessImpact: z.string().max(1_000),
    priority: EngineeringPrioritySchema,
    suggestedSolution: z.string().min(1).max(2_000),
    trend: z.enum(["improving", "stable", "worsening", "unknown"]),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringRiskRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    category: EngineeringRiskCategorySchema,
    title: z.string().min(1).max(255),
    severity: EngineeringSeveritySchema,
    likelihood: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
    mitigation: z.string().min(1).max(2_000),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    status: z.enum(["open", "mitigated", "accepted", "monitoring"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RepositoryHealthRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    repositoryName: z.string().min(1).max(255),
    architecture: ScoreSchema,
    documentation: ScoreSchema,
    tests: ScoreSchema,
    performance: ScoreSchema,
    security: ScoreSchema,
    complexity: ScoreSchema,
    dependencies: ScoreSchema,
    maintainability: ScoreSchema,
    technicalDebt: ScoreSchema,
    overall: ScoreSchema,
    trend: z.enum(["improving", "stable", "worsening", "unknown"]),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    assessedAt: z.iso.datetime(),
  })
  .strict();

export const ArchitectureHealthRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    score: ScoreSchema,
    drift: z.enum(["none", "low", "medium", "high", "unknown"]),
    layerViolations: z.number().int().nonnegative(),
    dependencyViolations: z.number().int().nonnegative(),
    couplingRisk: EngineeringSeveritySchema,
    recommendations: z.array(z.string().min(1).max(500)).max(50),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    assessedAt: z.iso.datetime(),
  })
  .strict();

export const RecommendationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    category: RecommendationCategorySchema,
    title: z.string().min(1).max(255),
    recommendation: z.string().min(1).max(2_000),
    priority: EngineeringPrioritySchema,
    estimatedImpact: z.string().min(1).max(1_000),
    estimatedEffort: z.string().min(1).max(120),
    confidence: z.number().min(0).max(1),
    dependencies: z.array(z.string().min(1).max(255)).max(50),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    status: z.enum(["open", "accepted", "dismissed", "superseded"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const OpportunityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    category: RecommendationCategorySchema,
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(2_000),
    priority: EngineeringPrioritySchema,
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    detectedAt: z.iso.datetime(),
  })
  .strict();

export const RoadmapItemRecordSchema = z
  .object({
    id: z.string().uuid(),
    roadmapId: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(255),
    phase: z.string().min(1).max(120),
    priority: EngineeringPrioritySchema,
    status: z.enum(["not_started", "in_progress", "blocked", "done"]),
    dependencies: z.array(z.string().uuid()).max(50),
    estimatedEffort: z.string().min(1).max(120),
    order: z.number().int().nonnegative(),
  })
  .strict();

export const RoadmapRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(255),
    horizon: z.enum(["30_days", "90_days", "180_days", "1_year"]),
    summary: z.string().min(1).max(2_000),
    items: z.array(RoadmapItemRecordSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ReleaseAssessmentRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    repositoryId: z.string().uuid().nullable(),
    releaseName: z.string().min(1).max(255),
    status: ReleaseReadinessStatusSchema,
    score: ScoreSchema,
    checks: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            status: z.enum(["pass", "warning", "fail", "unknown"]),
            summary: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(100),
    recommendation: z.string().min(1).max(2_000),
    assessedAt: z.iso.datetime(),
  })
  .strict();

export const SimulationRunRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    scenario: z.string().min(1).max(1_000),
    affectedFilesEstimate: z.number().int().nonnegative(),
    affectedRepositories: z.array(z.string().uuid()).max(100),
    risk: EngineeringSeveritySchema,
    migrationEffort: z.string().min(1).max(500),
    testingEffort: z.string().min(1).max(500),
    deploymentSteps: z.array(z.string().min(1).max(500)).max(50),
    rollbackComplexity: EngineeringSeveritySchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(AdvisorEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EngineeringMetricsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    activeGoals: z.number().int().nonnegative(),
    openRecommendations: z.number().int().nonnegative(),
    openRisks: z.number().int().nonnegative(),
    trackedDebtItems: z.number().int().nonnegative(),
    averageRepositoryHealth: ScoreSchema,
    releaseReadiness: ReleaseReadinessStatusSchema,
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const CreateEngineeringGoalRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2_000).default(""),
    priority: EngineeringPrioritySchema.default("medium"),
    affectedRepositoryIds: z.array(z.string().uuid()).max(100).default([]),
    rationale: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const CreateScenarioSimulationRequestSchema = z
  .object({
    scenario: z.string().trim().min(1).max(1_000),
    repositoryIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

export const AdvisorDashboardResponseSchema = z
  .object({
    goals: z.array(EngineeringGoalRecordSchema).max(100),
    recommendations: z.array(RecommendationRecordSchema).max(100),
    risks: z.array(EngineeringRiskRecordSchema).max(100),
    repositoryHealth: z.array(RepositoryHealthRecordSchema).max(100),
    architectureHealth: z.array(ArchitectureHealthRecordSchema).max(100),
    technicalDebt: z.array(TechnicalDebtRecordSchema).max(100),
    roadmaps: z.array(RoadmapRecordSchema).max(50),
    releaseAssessments: z.array(ReleaseAssessmentRecordSchema).max(50),
    metrics: EngineeringMetricsRecordSchema,
    advisoryOnly: z.literal(true),
  })
  .strict();

export const EngineeringGoalListResponseSchema = z
  .array(EngineeringGoalRecordSchema)
  .max(500);
export const EngineeringGoalResponseSchema = EngineeringGoalRecordSchema;
export const StrategicPlanResponseSchema = StrategicPlanRecordSchema;
export const RecommendationListResponseSchema = z
  .array(RecommendationRecordSchema)
  .max(500);
export const EngineeringRiskListResponseSchema = z
  .array(EngineeringRiskRecordSchema)
  .max(500);
export const RepositoryHealthListResponseSchema = z
  .array(RepositoryHealthRecordSchema)
  .max(500);
export const ArchitectureHealthListResponseSchema = z
  .array(ArchitectureHealthRecordSchema)
  .max(500);
export const TechnicalDebtListResponseSchema = z
  .array(TechnicalDebtRecordSchema)
  .max(500);
export const RoadmapListResponseSchema = z.array(RoadmapRecordSchema).max(100);
export const ReleaseAssessmentListResponseSchema = z
  .array(ReleaseAssessmentRecordSchema)
  .max(100);
export const ScenarioSimulationResponseSchema = SimulationRunRecordSchema;
export const EngineeringMetricsResponseSchema = EngineeringMetricsRecordSchema;

export type EngineeringGoalRecord = z.infer<typeof EngineeringGoalRecordSchema>;
export type StrategicPlanRecord = z.infer<typeof StrategicPlanRecordSchema>;
export type TechnicalDebtRecord = z.infer<typeof TechnicalDebtRecordSchema>;
export type EngineeringRiskRecord = z.infer<typeof EngineeringRiskRecordSchema>;
export type RepositoryHealthRecord = z.infer<typeof RepositoryHealthRecordSchema>;
export type ArchitectureHealthRecord = z.infer<typeof ArchitectureHealthRecordSchema>;
export type RecommendationRecord = z.infer<typeof RecommendationRecordSchema>;
export type OpportunityRecord = z.infer<typeof OpportunityRecordSchema>;
export type RoadmapRecord = z.infer<typeof RoadmapRecordSchema>;
export type RoadmapItemRecord = z.infer<typeof RoadmapItemRecordSchema>;
export type ReleaseAssessmentRecord = z.infer<typeof ReleaseAssessmentRecordSchema>;
export type SimulationRunRecord = z.infer<typeof SimulationRunRecordSchema>;
export type EngineeringMetricsRecord = z.infer<typeof EngineeringMetricsRecordSchema>;
export type CreateEngineeringGoalRequest = z.infer<
  typeof CreateEngineeringGoalRequestSchema
>;
export type CreateScenarioSimulationRequest = z.infer<
  typeof CreateScenarioSimulationRequestSchema
>;
export type AdvisorDashboardResponse = z.infer<typeof AdvisorDashboardResponseSchema>;
export type AdvisorEvidence = z.infer<typeof AdvisorEvidenceSchema>;
