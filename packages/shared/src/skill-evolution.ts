import { z } from "zod";

import { AdapterCapabilitySchema } from "./applications.js";

export const SkillEvolutionTypeSchema = z.enum([
  "WORKFLOW_SKILL",
  "ANALYSIS_SKILL",
  "TRANSFORMATION_SKILL",
  "APPLICATION_SKILL",
  "RESEARCH_SKILL",
  "EXECUTIVE_SKILL",
  "COMMUNICATION_SKILL",
  "DATA_SKILL",
  "AUTOMATION_SKILL",
]);

export const SkillEvolutionStatusSchema = z.enum([
  "CANDIDATE",
  "DRAFT",
  "TESTING",
  "VALIDATED",
  "PENDING_APPROVAL",
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
  "FAILED",
  "SUPERSEDED",
  "QUARANTINED",
]);

export const SkillHealthStateSchema = z.enum([
  "HEALTHY",
  "DEGRADED",
  "UNDER_REVIEW",
  "DISABLED",
  "UNKNOWN",
]);

export const SkillCandidateStatusSchema = z.enum([
  "OBSERVATION",
  "CANDIDATE",
  "SPECIFIED",
  "DISMISSED",
  "SUPPRESSED",
  "MERGED",
  "PROMOTED",
]);

export const SkillCandidateCategorySchema = z.enum([
  "REPETITIVE_MANUAL_WORK",
  "REUSABLE_WORKFLOW",
  "MISSING_CAPABILITY",
  "INEFFICIENT_EXISTING_SKILL",
  "ERROR_PRONE_WORKFLOW",
  "HIGH_SUCCESS_PATTERN",
  "USER_REQUESTED_SKILL",
]);

export const SkillEvolutionRiskClassSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const SkillEvolutionScopeSchema = z.enum([
  "GLOBAL_OWNER",
  "PROJECT",
  "WORKSPACE",
  "DEVICE",
]);

export const SkillModelRoutingPolicySchema = z.enum([
  "LOCAL_ONLY",
  "LOCAL_PREFERRED",
  "CLOUD_ALLOWED",
]);

export const SkillApprovalPolicySchema = z.enum([
  "NONE",
  "OWNER_APPROVAL",
  "RECENT_AUTH",
  "EXPLICIT_HIGH_RISK_APPROVAL",
  "PROHIBITED",
]);

export const SkillCandidateEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    sourceType: z.enum([
      "REFLECTION",
      "LEARNING",
      "WORKFLOW_HISTORY",
      "AGENT_HISTORY",
      "EXECUTION_TRACE",
      "DEMONSTRATION",
      "USER_REQUEST",
      "SKILL_USAGE",
    ]),
    sourceId: z.string().max(200).nullable(),
    summary: z.string().min(1).max(1_000),
    occurredAt: z.iso.datetime(),
    weight: z.number().min(0).max(1).default(0.5),
  })
  .strict();

export const SkillStepSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    kind: z.enum([
      "CAPABILITY",
      "WORKFLOW",
      "MODEL_REASONING",
      "VALIDATION",
      "TRANSFORMATION",
      "OUTPUT",
    ]),
    capability: AdapterCapabilitySchema.nullable().default(null),
    requiresApproval: z.boolean().default(false),
    sideEffect: z.boolean().default(false),
    timeoutMs: z.number().int().positive().max(3_600_000).default(60_000),
    dependsOn: z.array(z.string().min(1).max(80)).max(50).default([]),
  })
  .strict();

export const SkillDefinitionSchema = z
  .object({
    skillId: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    purpose: z.string().min(1).max(1_000),
    version: z.number().int().positive(),
    status: SkillEvolutionStatusSchema,
    type: SkillEvolutionTypeSchema,
    scope: SkillEvolutionScopeSchema.default("GLOBAL_OWNER"),
    projectId: z.string().uuid().nullable().default(null),
    workspaceId: z.string().uuid().nullable().default(null),
    deviceId: z.string().uuid().nullable().default(null),
    inputs: z.record(z.string().min(1).max(80), z.json()).default({}),
    outputs: z.array(z.string().min(1).max(160)).max(50).default([]),
    preconditions: z.array(z.string().min(1).max(300)).max(50).default([]),
    postconditions: z.array(z.string().min(1).max(300)).max(50).default([]),
    requiredCapabilities: z.array(AdapterCapabilitySchema).max(100).default([]),
    requiredAdapters: z.array(z.string().min(1).max(160)).max(50).default([]),
    requiredTools: z.array(z.string().min(1).max(160)).max(50).default([]),
    steps: z.array(SkillStepSchema).min(1).max(100),
    constraints: z.array(z.string().min(1).max(500)).max(50).default([]),
    riskClass: SkillEvolutionRiskClassSchema,
    approvalPolicy: SkillApprovalPolicySchema,
    modelRoutingPolicy: SkillModelRoutingPolicySchema.default("LOCAL_PREFERRED"),
    privacyClass: z.enum(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]).default("PRIVATE"),
    generatedImplementation: z.literal(false).default(false),
    arbitraryShellAllowed: z.literal(false).default(false),
    policyMutationAllowed: z.literal(false).default(false),
    selfApprovalAllowed: z.literal(false).default(false),
  })
  .strict();

export const SkillEvolutionCandidateSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1).max(180),
    description: z.string().min(1).max(1_000),
    category: SkillCandidateCategorySchema,
    sourceType: z.enum([
      "REFLECTION",
      "LEARNING",
      "DEMONSTRATION",
      "USER_REQUEST",
      "WORKFLOW_HISTORY",
      "SKILL_USAGE",
    ]),
    supportingEvidence: z.array(SkillCandidateEvidenceSchema).max(100),
    recurrenceCount: z.number().int().nonnegative(),
    proposedInputs: z.array(z.string().min(1).max(80)).max(50).default([]),
    proposedOutputs: z.array(z.string().min(1).max(120)).max(50).default([]),
    proposedCapabilities: z.array(AdapterCapabilitySchema).max(100).default([]),
    expectedBenefit: z.string().min(1).max(1_000),
    observedPainPoint: z.string().max(1_000).nullable().default(null),
    confidence: z.number().min(0).max(1),
    riskClass: SkillEvolutionRiskClassSchema,
    status: SkillCandidateStatusSchema,
    suppressedUntil: z.iso.datetime().nullable().default(null),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionSkillSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    purpose: z.string().min(1).max(1_000),
    activeVersionId: z.string().uuid().nullable(),
    status: SkillEvolutionStatusSchema,
    riskClass: SkillEvolutionRiskClassSchema,
    createdFromCandidateId: z.string().uuid().nullable(),
    requiredCapabilities: z.array(AdapterCapabilitySchema).max(100),
    usageCount: z.number().int().nonnegative().default(0),
    successRate: z.number().min(0).max(1).nullable().default(null),
    lastUsedAt: z.iso.datetime().nullable().default(null),
    healthState: SkillHealthStateSchema.default("UNKNOWN"),
    plannerEligible: z.boolean().default(false),
    protected: z.boolean().default(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillVersionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    version: z.number().int().positive(),
    status: SkillEvolutionStatusSchema,
    definition: SkillDefinitionSchema,
    sourceCandidateId: z.string().uuid().nullable(),
    sourceEvidenceIds: z.array(z.string().uuid()).max(100).default([]),
    sourceDemonstrationId: z.string().uuid().nullable().default(null),
    sourceReflectionId: z.string().uuid().nullable().default(null),
    createdBy: z.enum(["OWNER", "SYSTEM", "MODEL_ASSISTED"]),
    modelProvider: z.string().max(120).nullable().default(null),
    modelId: z.string().max(120).nullable().default(null),
    humanApprovalId: z.string().uuid().nullable().default(null),
    immutable: z.literal(true).default(true),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillValidationFindingSchema = z
  .object({
    code: z.string().min(1).max(80),
    severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
    message: z.string().min(1).max(500),
    field: z.string().max(120).nullable().default(null),
  })
  .strict();

export const SkillValidationResultSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    versionId: z.string().uuid(),
    status: z.enum(["PASSED", "FAILED"]),
    findings: z.array(SkillValidationFindingSchema).max(100),
    undeclaredCapabilityAccepted: z.literal(false).default(false),
    unsafeCapabilityAccepted: z.literal(false).default(false),
    policyMutationDetected: z.boolean().default(false),
    selfApprovalDetected: z.boolean().default(false),
    validatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillBenchmarkResultSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    versionId: z.string().uuid(),
    profile: z.string().min(1).max(120),
    mode: z.enum(["DRY_RUN", "SANDBOX", "SHADOW", "CANARY"]),
    testCases: z.number().int().nonnegative(),
    successes: z.number().int().nonnegative(),
    regressions: z.number().int().nonnegative(),
    latencyMsP50: z.number().nonnegative(),
    latencyMsP95: z.number().nonnegative(),
    costUsd: z.number().nonnegative(),
    humanInterventions: z.number().int().nonnegative(),
    baselineSuccessRate: z.number().min(0).max(1).nullable().default(null),
    candidateSuccessRate: z.number().min(0).max(1),
    promotionRecommendation: z.enum([
      "PROMOTE",
      "REQUIRES_APPROVAL",
      "DO_NOT_PROMOTE",
      "INSUFFICIENT_DATA",
    ]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid().nullable(),
    candidateId: z.string().uuid().nullable(),
    type: z.enum([
      "CANDIDATE_CREATED",
      "CANDIDATE_SUPPRESSED",
      "SPEC_GENERATED",
      "VALIDATION_FAILED",
      "VALIDATION_PASSED",
      "SANDBOX_EVALUATED",
      "BENCHMARK_RECORDED",
      "PROMOTION_RECOMMENDED",
      "PROMOTED",
      "ROLLBACK_RECOMMENDED",
      "ROLLED_BACK",
      "DEPRECATED",
      "DISABLED",
      "QUARANTINED",
      "CANDIDATE_DISMISSED",
      "DRAFT_BENCHMARK_RECORDED",
      "SHADOW_EVALUATED",
      "CANARY_STARTED",
      "CANARY_EVALUATED",
      "DEGRADATION_DETECTED",
    ]),
    summary: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    versionId: z.string().uuid(),
    outcome: z.enum(["SUCCESS", "FAILED", "CANCELLED", "DENIED"]),
    latencyMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    capabilityCalls: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionQuerySchema = z
  .object({
    type: z.enum([
      "LIST_SKILLS",
      "LIST_CANDIDATES",
      "CREATE_CANDIDATE",
      "EVALUATE_SKILL",
      "COMPARE_VERSIONS",
      "PROPOSE_IMPROVEMENT",
      "PROMOTE",
      "ROLLBACK",
      "DEPRECATE",
      "MERGE_ANALYSIS",
      "DISABLE",
    ]),
    targetSkill: z.string().uuid().nullable().default(null),
    candidateId: z.string().uuid().nullable().default(null),
    scope: SkillEvolutionScopeSchema.nullable().default(null),
    requestedAction: z.string().max(500).nullable().default(null),
  })
  .strict();

export const CreateSkillCandidateRequestSchema = z
  .object({
    title: z.string().min(1).max(180),
    description: z.string().min(1).max(1_000),
    category: SkillCandidateCategorySchema.default("USER_REQUESTED_SKILL"),
    evidence: z.array(SkillCandidateEvidenceSchema.omit({ id: true })).max(50).default([]),
    proposedCapabilities: z.array(AdapterCapabilitySchema).max(100).default([]),
    explicitUserRequest: z.boolean().default(false),
  })
  .strict();

export const SkillVersionIdRequestSchema = z
  .object({
    skillId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const SkillCandidateIdRequestSchema = z
  .object({
    candidateId: z.string().uuid(),
    reason: z.string().max(500).optional(),
    suppressUntil: z.iso.datetime().optional(),
  })
  .strict();

export const SkillDraftSchema = z
  .object({
    name: z.string().min(1).max(160),
    purpose: z.string().min(1).max(1_000),
    inputs: z.record(z.string().min(1).max(80), z.json()).default({}),
    outputs: z.array(z.string().min(1).max(160)).max(50).default([]),
    proposedSteps: z.array(z.string().min(1).max(240)).min(1).max(50),
    proposedCapabilities: z.array(z.string().min(1).max(160)).max(50),
    assumptions: z.array(z.string().min(1).max(300)).max(20).default([]),
    errorHandling: z.array(z.string().min(1).max(300)).max(20).default([]),
  })
  .strict();

export const SkillDraftProposalSchema = z
  .object({
    name: z.string().min(1).max(80),
    purpose: z.string().min(1).max(240),
    inputs: z
      .array(
        z
          .object({
            name: z.string().min(1).max(60),
            description: z.string().min(1).max(160),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(4)
      .default([]),
    outputs: z
      .array(
        z
          .object({
            name: z.string().min(1).max(60),
            description: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(4)
      .default([]),
    steps: z
      .array(
        z
          .object({
            order: z.number().int().min(1).max(8),
            description: z.string().min(1).max(160),
            capabilityHint: z.string().min(1).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    assumptions: z.array(z.string().min(1).max(160)).max(4).default([]),
    errorHandling: z.array(z.string().min(1).max(160)).max(4).default([]),
  })
  .strict();

export const SkillDraftBenchmarkRunSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    suiteVersion: z.string().min(1).max(120),
    contractVersion: z.string().min(1).max(120),
    contextVersion: z.string().min(1).max(120),
    modelProvider: z.string().min(1).max(120),
    modelId: z.string().min(1).max(160),
    status: z.enum(["PASS", "FAIL", "PARTIAL"]),
    cases: z.number().int().nonnegative(),
    structuredFirstPassRate: z.number().min(0).max(1),
    afterDeterministicRepairRate: z.number().min(0).max(1).default(0),
    afterModelRepairRate: z.number().min(0).max(1).default(0),
    structuredFinalRate: z.number().min(0).max(1),
    validCapabilityProposalRate: z.number().min(0).max(1),
    unsafeCapabilityProposalCount: z.number().int().nonnegative(),
    unsafeProposalAccepted: z.literal(0),
    duplicateDetectionRate: z.number().min(0).max(1),
    draftUsefulnessRate: z.number().min(0).max(1),
    averageLatencyMs: z.number().nonnegative(),
    p50LatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
    failedCaseIds: z.array(z.string().min(1).max(120)).max(100).default([]),
    mostCommonFailureCategory: z.string().min(1).max(120).nullable().default(null),
    promptVersion: z.string().min(1).max(120).default("skill-draft-prompt-v1"),
    modelFacingSchemaVersion: z.string().min(1).max(120).default("skill-draft-contract-v1"),
    repairPolicyVersion: z.string().min(1).max(120).default("none"),
    baseline: z.boolean().default(false),
    baselineName: z.string().max(160).nullable().default(null),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillDraftBenchmarkCaseResultSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    runId: z.string().uuid(),
    caseId: z.string().min(1).max(120),
    category: z.string().min(1).max(120),
    structuredFirstPass: z.boolean(),
    structuredFinal: z.boolean(),
    validCapabilityProposal: z.boolean(),
    unsafeCapabilityProposed: z.boolean(),
    unsafeProposalAccepted: z.literal(false),
    duplicateDetected: z.boolean(),
    useful: z.boolean(),
    latencyMs: z.number().nonnegative(),
    failureStage: z
      .enum(["FIRST_PASS", "DETERMINISTIC_REPAIR", "MODEL_REPAIR", "CAPABILITY_VALIDATION"])
      .nullable()
      .default(null),
    failureCategory: z.string().min(1).max(120).nullable().default(null),
    schemaErrors: z.array(z.string().min(1).max(240)).max(20).default([]),
    repairAttempted: z.boolean().default(false),
    deterministicRepairSuccess: z.boolean().default(false),
    modelRepairAttempted: z.boolean().default(false),
    modelRepairSuccess: z.boolean().default(false),
    failureReason: z.string().max(500).nullable().default(null),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionEvaluationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    versionId: z.string().uuid(),
    mode: z.enum(["SHADOW", "CANARY", "DEGRADATION"]),
    status: z.enum(["UNKNOWN", "PASSED", "FAILED", "DEGRADED", "ROLLBACK_RECOMMENDED", "DENIED"]),
    sampleCount: z.number().int().nonnegative(),
    minimumSampleCount: z.number().int().positive(),
    outputAgreement: z.number().min(0).max(1).nullable().default(null),
    correctness: z.number().min(0).max(1).nullable().default(null),
    latencyMsP95: z.number().nonnegative().nullable().default(null),
    costUsd: z.number().nonnegative().default(0),
    humanInterventions: z.number().int().nonnegative().default(0),
    maxCanaryRuns: z.number().int().nonnegative().nullable().default(null),
    maxCanaryFailures: z.number().int().nonnegative().nullable().default(null),
    failures: z.number().int().nonnegative().default(0),
    rollbackRecommended: z.boolean().default(false),
    reason: z.string().max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillEvolutionDashboardSchema = z
  .object({
    skills: z.array(SkillEvolutionSkillSchema),
    candidates: z.array(SkillEvolutionCandidateSchema),
    versions: z.array(SkillVersionSchema),
    validations: z.array(SkillValidationResultSchema),
    benchmarks: z.array(SkillBenchmarkResultSchema),
    evaluations: z.array(SkillEvolutionEvaluationRecordSchema),
    draftBenchmarkRuns: z.array(SkillDraftBenchmarkRunSchema),
    draftBenchmarkResults: z.array(SkillDraftBenchmarkCaseResultSchema),
    usage: z.array(SkillEvolutionUsageRecordSchema),
    events: z.array(SkillEvolutionEventSchema),
    summary: z.object({
      activeSkills: z.number().int().nonnegative(),
      candidates: z.number().int().nonnegative(),
      testing: z.number().int().nonnegative(),
      degraded: z.number().int().nonnegative(),
      unsafeCapabilityAccepted: z.literal(0),
      selfApproval: z.literal(0),
      policyMutation: z.literal(0),
      crossOwnerLeakage: z.literal(0),
      unvalidatedSkillActivation: z.literal(0),
    }),
    arbitrarySelfModificationAvailable: z.literal(false),
    directCodeExecutionAvailable: z.literal(false),
    policyMutationAvailable: z.literal(false),
  })
  .strict();

export type SkillCandidateCategory = z.infer<typeof SkillCandidateCategorySchema>;
export type SkillEvolutionCandidate = z.infer<typeof SkillEvolutionCandidateSchema>;
export type SkillEvolutionSkill = z.infer<typeof SkillEvolutionSkillSchema>;
export type SkillVersion = z.infer<typeof SkillVersionSchema>;
export type SkillValidationResult = z.infer<typeof SkillValidationResultSchema>;
export type SkillBenchmarkResult = z.infer<typeof SkillBenchmarkResultSchema>;
export type SkillEvolutionEvent = z.infer<typeof SkillEvolutionEventSchema>;
export type SkillEvolutionUsageRecord = z.infer<typeof SkillEvolutionUsageRecordSchema>;
export type SkillValidationFinding = z.infer<typeof SkillValidationFindingSchema>;
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;
export type SkillEvolutionEvaluationRecord = z.infer<typeof SkillEvolutionEvaluationRecordSchema>;
export type SkillDraftBenchmarkRun = z.infer<typeof SkillDraftBenchmarkRunSchema>;
export type SkillDraftBenchmarkCaseResult = z.infer<typeof SkillDraftBenchmarkCaseResultSchema>;
export type SkillDraft = z.infer<typeof SkillDraftSchema>;
export type SkillDraftProposal = z.infer<typeof SkillDraftProposalSchema>;
