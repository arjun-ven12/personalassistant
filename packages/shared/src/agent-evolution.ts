import { z } from "zod";

import { MemoryEvidenceSchema } from "./memory.js";

export const ExpertiseLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert",
  "specialist",
  "master",
]);

export const EvolutionProposalTypeSchema = z.enum([
  "add_capability",
  "refine_capability",
  "merge_capability",
  "split_capability",
  "retire_capability",
  "create_specialist",
  "prompt_improvement",
  "workflow_improvement",
  "specialization_change",
  "confidence_calibration",
  "knowledge_organization",
]);

export const EvolutionProposalStatusSchema = z.enum([
  "proposed",
  "approved",
  "rejected",
  "superseded",
  "archived",
]);

export const EvolutionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    category: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    level: ExpertiseLevelSchema,
    experienceCount: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    successRate: z.number().min(0).max(1),
    recencyScore: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    relatedProjects: z.array(z.string().min(1).max(255)).max(100),
    growthTrend: z.number().min(-1).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ExpertiseHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    expertiseId: z.string().uuid(),
    previousLevel: ExpertiseLevelSchema.nullable(),
    newLevel: ExpertiseLevelSchema,
    reason: z.string().min(1).max(1_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EvolutionProposalRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    type: EvolutionProposalTypeSchema,
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    impact: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1),
    risk: z.enum(["low", "medium", "high"]),
    rollbackPlan: z.string().min(1).max(2_000),
    status: EvolutionProposalStatusSchema,
    requiresApproval: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    subjectType: z.enum(["capability", "prompt", "reasoning"]),
    subjectId: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    changeSummary: z.string().min(1).max(1_000),
    proposalId: z.string().uuid().nullable(),
    approved: z.literal(false),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ImprovementRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    area: z.enum(["workflow", "knowledge"]),
    title: z.string().min(1).max(255),
    recommendation: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    confidence: z.number().min(0).max(1),
    status: EvolutionProposalStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const OutcomeHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    outcomeType: z.enum(["failure", "success"]),
    rootCause: z.string().min(1).max(1_000),
    pattern: z.string().min(1).max(1_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    relatedProposalId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const BenchmarkResultRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    benchmarkName: z.string().min(1).max(120),
    comparedTo: z.string().min(1).max(255),
    score: z.number().min(0).max(1),
    trend: z.number().min(-1).max(1),
    summary: z.string().min(1).max(1_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const EvolutionTimelineRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    eventType: z.string().min(1).max(120),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const SelfEvaluationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    strengths: z.array(z.string().min(1).max(500)).max(50),
    weaknesses: z.array(z.string().min(1).max(500)).max(50),
    blindSpots: z.array(z.string().min(1).max(500)).max(50),
    knowledgeGaps: z.array(z.string().min(1).max(500)).max(50),
    reasoningQuality: z.number().min(0).max(1),
    planningQuality: z.number().min(0).max(1),
    memoryQuality: z.number().min(0).max(1),
    toolUsageQuality: z.number().min(0).max(1),
    recommendations: z.array(z.string().min(1).max(1_000)).max(50),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CapabilityMarketplaceRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    popularity: z.number().int().nonnegative(),
    reuseCount: z.number().int().nonnegative(),
    qualityScore: z.number().min(0).max(1),
    dependencies: z.array(z.string().min(1).max(120)).max(100),
    version: z.string().min(1).max(40),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EvolutionDashboardResponseSchema = z
  .object({
    expertise: z.array(EvolutionRecordSchema).max(500),
    expertiseHistory: z.array(ExpertiseHistoryRecordSchema).max(500),
    proposals: z.array(EvolutionProposalRecordSchema).max(500),
    capabilityVersions: z.array(VersionRecordSchema).max(500),
    promptVersions: z.array(VersionRecordSchema).max(500),
    reasoningVersions: z.array(VersionRecordSchema).max(500),
    workflowImprovements: z.array(ImprovementRecordSchema).max(500),
    knowledgeImprovements: z.array(ImprovementRecordSchema).max(500),
    failureHistory: z.array(OutcomeHistoryRecordSchema).max(500),
    successHistory: z.array(OutcomeHistoryRecordSchema).max(500),
    benchmarks: z.array(BenchmarkResultRecordSchema).max(500),
    timeline: z.array(EvolutionTimelineRecordSchema).max(500),
    selfEvaluations: z.array(SelfEvaluationRecordSchema).max(500),
    marketplace: z.array(CapabilityMarketplaceRecordSchema).max(500),
    approvalRequired: z.literal(true),
    automaticMutationEnabled: z.literal(false),
  })
  .strict();

export const CreateEvolutionProposalRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    type: EvolutionProposalTypeSchema,
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100).default([]),
    impact: z.enum(["low", "medium", "high"]).default("medium"),
    confidence: z.number().min(0).max(1).default(0.75),
    risk: z.enum(["low", "medium", "high"]).default("low"),
    rollbackPlan: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const RunEvolutionAnalysisRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    focus: z
      .enum([
        "expertise",
        "capabilities",
        "prompt",
        "reasoning",
        "workflow",
        "knowledge",
      ])
      .default("expertise"),
  })
  .strict();

export const EvolutionProposalResponseSchema = z
  .object({ proposal: EvolutionProposalRecordSchema })
  .strict();

export const EvolutionAnalysisResponseSchema = z
  .object({
    proposal: EvolutionProposalRecordSchema,
    benchmark: BenchmarkResultRecordSchema,
    selfEvaluation: SelfEvaluationRecordSchema,
  })
  .strict();

export type ExpertiseRecord = z.infer<typeof EvolutionRecordSchema>;
export type ExpertiseHistoryRecord = z.infer<typeof ExpertiseHistoryRecordSchema>;
export type EvolutionProposalRecord = z.infer<typeof EvolutionProposalRecordSchema>;
export type VersionRecord = z.infer<typeof VersionRecordSchema>;
export type ImprovementRecord = z.infer<typeof ImprovementRecordSchema>;
export type OutcomeHistoryRecord = z.infer<typeof OutcomeHistoryRecordSchema>;
export type BenchmarkResultRecord = z.infer<typeof BenchmarkResultRecordSchema>;
export type EvolutionTimelineRecord = z.infer<typeof EvolutionTimelineRecordSchema>;
export type SelfEvaluationRecord = z.infer<typeof SelfEvaluationRecordSchema>;
export type CapabilityMarketplaceRecord = z.infer<
  typeof CapabilityMarketplaceRecordSchema
>;
export type EvolutionDashboardResponse = z.infer<
  typeof EvolutionDashboardResponseSchema
>;
export type CreateEvolutionProposalRequest = z.infer<
  typeof CreateEvolutionProposalRequestSchema
>;
export type RunEvolutionAnalysisRequest = z.infer<
  typeof RunEvolutionAnalysisRequestSchema
>;
