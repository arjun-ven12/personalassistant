import { z } from "zod";

const credits = z.number().int().nonnegative().max(1_000_000);
const boundedId = z.string().min(1).max(160);

export const ExperimentStatusSchema = z.enum([
  "DRAFT", "VALIDATING", "READY", "RUNNING", "PAUSED", "COMPLETED", "STOPPED", "FAILED", "CANCELLED",
]);
export const ExperimentVerdictSchema = z.enum([
  "WINNER", "LOSER", "INCONCLUSIVE", "STOPPED_BY_GUARDRAIL", "INSUFFICIENT_EVIDENCE",
]);
export const ExperimentTriggerSchema = z.enum([
  "LOW_STRATEGY_CONFIDENCE", "METRIC_STAGNATION", "NEW_CONTEXT", "MULTIPLE_VIABLE_STRATEGIES", "OWNER_REQUEST", "POST_FAILURE_RECOVERY",
]);
export const ExplorationLevelSchema = z.enum(["LOW", "BALANCED", "HIGH"]);

export const ExperimentMetricSchema = z.object({
  id: boundedId,
  name: z.string().min(1).max(120),
  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]),
  minimumMeaningfulImprovement: z.number().nonnegative(),
  aggregation: z.enum(["RATE", "AVERAGE", "SUM"]),
}).strict();

export const ExperimentGuardrailSchema = z.object({
  metricId: boundedId,
  name: z.string().min(1).max(120),
  direction: z.enum(["MAXIMUM", "MINIMUM"]),
  threshold: z.number(),
}).strict();

export const ExperimentSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), organizationId: boundedId.nullable(), objectiveId: z.string().uuid(), projectId: z.string().uuid().nullable(),
  title: z.string().min(1).max(160), hypothesis: z.string().min(20).max(1_000), expectedDirection: z.enum(["INCREASE", "DECREASE"]),
  status: ExperimentStatusSchema, trigger: ExperimentTriggerSchema, primaryMetric: ExperimentMetricSchema,
  guardrails: z.array(ExperimentGuardrailSchema).max(8), explorationBudget: credits.positive(), spentCredits: credits,
  explorationLevel: ExplorationLevelSchema, minimumSampleSize: z.number().int().min(5).max(100_000),
  maxDurationHours: z.number().int().min(1).max(2_160), minimumReallocationIntervalMinutes: z.number().int().min(15).max(10_080),
  context: z.record(z.string().max(80), z.string().max(240)), configurationKeys: z.array(z.string().max(80)).min(1).max(12),
  priorExperimentIds: z.array(z.string().uuid()).max(20), activationKey: z.string().max(200).nullable(),
  startedAt: z.iso.datetime().nullable(), endedAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  invariants: z.object({ authorityMayVary: z.literal(false), approvalsMayVary: z.literal(false), permissionsMayVary: z.literal(false), schedulerReused: z.literal(true) }).strict(),
}).strict();

export const ExperimentVariantConfigurationSchema = z.object({
  workflowTemplateId: z.string().uuid().optional(), messageStyle: z.enum(["FORMAL", "CONCISE", "CONSULTATIVE", "PROBLEM_FOCUSED"]).optional(),
  channel: z.enum(["INTERNAL", "EMAIL", "WEB", "CRM"]).optional(), timingBucket: z.enum(["MORNING", "AFTERNOON", "EVENING"]).optional(),
  agentSelectionPolicy: z.enum(["HIGHEST_REPUTATION", "COST_EFFICIENT", "SPECIALIST_FIRST", "BALANCED"]).optional(),
  modelPolicy: z.enum(["LOCAL_FIRST", "CHEAP_CLOUD_FIRST", "HIGH_QUALITY_CLOUD"]).optional(),
  reviewDepth: z.enum(["STANDARD", "SPECIALIST", "DOUBLE_REVIEW"]).optional(), researchMethod: z.enum(["DIRECT", "EVIDENCE_FIRST", "COMPARATIVE"]).optional(),
}).strict();

export const ExperimentVariantSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), name: z.string().min(1).max(120),
  role: z.enum(["CONTROL", "VARIANT"]), strategyVersion: z.number().int().positive().nullable(), configuration: ExperimentVariantConfigurationSchema,
  budgetCredits: credits.positive(), spentCredits: credits, allocationPercent: z.number().int().min(0).max(100),
  predictedSuccess: z.number().min(0).max(1), predictedCost: credits, predictedMetricImpact: z.number(), predictedDurationMs: z.number().int().nonnegative().max(31_536_000_000),
  sampleSize: z.number().int().nonnegative(), completedOutcomes: z.number().int().nonnegative(), actualMetric: z.number().nullable(), actualSuccessRate: z.number().min(0).max(1).nullable(), actualCost: credits, actualDurationMs: z.number().int().nonnegative(),
  status: z.enum(["READY", "RUNNING", "LEADING", "TRAILING", "PAUSED", "RETIRED", "STOPPED", "COMPLETED"]), verdict: ExperimentVerdictSchema.nullable(),
  calibration: z.number().min(0).max(1).nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();

export const ExperimentAssignmentSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), subjectId: boundedId, variantId: z.string().uuid(), assignedAt: z.iso.datetime(),
}).strict();
export const ExperimentObservationSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), variantId: z.string().uuid(), subjectId: boundedId,
  metricId: boundedId, value: z.number(), costCredits: credits, durationMs: z.number().int().nonnegative().max(31_536_000_000), success: z.boolean(),
  source: z.enum(["SYSTEM", "WORKFLOW", "EVALUATOR", "HUMAN_REVIEW", "EXTERNAL_VERIFIED"]), evidenceRefs: z.array(boundedId).min(1).max(20),
  idempotencyKey: z.string().min(8).max(200), observedAt: z.iso.datetime(),
}).strict();
export const ExperimentAllocationEventSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), allocations: z.record(z.string().uuid(), z.number().int().min(0).max(100)),
  reason: z.string().min(1).max(500), evidence: z.record(z.string().max(80), z.json()), idempotencyKey: z.string().min(8).max(200), createdAt: z.iso.datetime(),
}).strict();
export const ExperimentResultSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), variantId: z.string().uuid().nullable(),
  verdict: ExperimentVerdictSchema, metricResults: z.record(boundedId, z.number()), totalCost: credits, durationMs: z.number().int().nonnegative(), sampleSize: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1), evidenceRefs: z.array(boundedId).max(200), possibleProxyOptimization: z.boolean(), explanation: z.string().min(1).max(1_000), createdAt: z.iso.datetime(),
}).strict();
export const ExperimentTimelineEventSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), experimentId: z.string().uuid(), type: z.enum(["CREATED", "ACTIVATED", "PAUSED", "RESUMED", "OBSERVED", "GUARDRAIL_BREACHED", "REALLOCATED", "VARIANT_RETIRED", "COMPLETED", "STOPPED", "OWNER_OVERRIDE", "LEARNING_CANDIDATE_CREATED"]),
  summary: z.string().min(1).max(1_000), metadata: z.record(z.string().max(80), z.json()), idempotencyKey: z.string().min(8).max(200).nullable(), createdAt: z.iso.datetime(),
}).strict();

export const CreateExperimentVariantSchema = z.object({
  name: z.string().min(1).max(120), role: z.enum(["CONTROL", "VARIANT"]), configuration: ExperimentVariantConfigurationSchema,
  budgetCredits: credits.positive(), predictedSuccess: z.number().min(0).max(1), predictedCost: credits, predictedMetricImpact: z.number(), predictedDurationMs: z.number().int().nonnegative().max(31_536_000_000), strategyVersion: z.number().int().positive().nullable().default(null),
}).strict();
export const CreateExperimentRequestSchema = z.object({
  title: z.string().trim().min(1).max(160), hypothesis: z.string().trim().min(20).max(1_000), expectedDirection: z.enum(["INCREASE", "DECREASE"]), trigger: ExperimentTriggerSchema.default("OWNER_REQUEST"),
  projectId: z.string().uuid().nullable().default(null), primaryMetric: ExperimentMetricSchema, guardrails: z.array(ExperimentGuardrailSchema).max(8).default([]),
  explorationBudget: credits.positive(), explorationLevel: ExplorationLevelSchema.default("BALANCED"), minimumSampleSize: z.number().int().min(5).max(100_000).default(20), maxDurationHours: z.number().int().min(1).max(2_160).default(168),
  context: z.record(z.string().max(80), z.string().max(240)).default({}), variants: z.array(CreateExperimentVariantSchema).min(2).max(3),
}).strict();
export const RecordExperimentObservationRequestSchema = ExperimentObservationSchema.omit({ id:true, ownerId:true, experimentId:true, observedAt:true });
export const ExperimentMutationRequestSchema = z.object({ idempotencyKey:z.string().min(8).max(200) }).strict();
export const ExperimentAssignmentRequestSchema = z.object({ subjectId:boundedId }).strict();
export const ModifyExperimentRequestSchema = z.object({
  idempotencyKey:z.string().min(8).max(200), explorationBudget:credits.positive().optional(), explorationLevel:ExplorationLevelSchema.optional(),
  forceControlVariantId:z.string().uuid().optional(), retireVariantId:z.string().uuid().optional(),
}).strict().refine((value)=>value.explorationBudget!==undefined||value.explorationLevel!==undefined||value.forceControlVariantId!==undefined||value.retireVariantId!==undefined,{message:"At least one experiment field must be supplied."});

export const ExperimentDashboardSchema = z.object({
  experiments:z.array(ExperimentSchema).max(1_000), variants:z.array(ExperimentVariantSchema).max(3_000), assignments:z.array(ExperimentAssignmentSchema).max(20_000), observations:z.array(ExperimentObservationSchema).max(50_000), allocations:z.array(ExperimentAllocationEventSchema).max(10_000), results:z.array(ExperimentResultSchema).max(3_000), timeline:z.array(ExperimentTimelineEventSchema).max(20_000),
  summary:z.object({running:z.number().int().nonnegative(),paused:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),budgetAllocated:credits,budgetSpent:credits}).strict(),
  invariants:z.object({experimentsGrantAuthority:z.literal(false),verifiedEvidenceOnly:z.literal(true),objectiveBudgetConserved:z.literal(true),existingSchedulerUsed:z.literal(true)}).strict(),
}).strict();

export type Experiment = z.infer<typeof ExperimentSchema>;
export type ExperimentVariant = z.infer<typeof ExperimentVariantSchema>;
export type ExperimentAssignment = z.infer<typeof ExperimentAssignmentSchema>;
export type ExperimentObservation = z.infer<typeof ExperimentObservationSchema>;
export type ExperimentAllocationEvent = z.infer<typeof ExperimentAllocationEventSchema>;
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
export type ExperimentTimelineEvent = z.infer<typeof ExperimentTimelineEventSchema>;
