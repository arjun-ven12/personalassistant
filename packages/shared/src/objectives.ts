import { z } from "zod";

export const ObjectiveExecutionStatusSchema = z.enum([
  "DRAFT", "PLANNING", "AWAITING_CONFIRMATION", "ACTIVE", "PAUSED",
  "AT_RISK", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED",
]);
export const ObjectiveReplanTriggerSchema = z.enum([
  "MAJOR_PROJECT_FAILURE", "WORKFLOW_FAILURE", "BUDGET_AT_RISK",
  "DEADLINE_AT_RISK", "METRIC_STAGNATION", "CAPABILITY_BLOCK", "OWNER_CHANGE",
]);
export const ObjectiveWorkflowScoreSchema = z.object({
  templateId: z.string().uuid(), name: z.string().min(1).max(160),
  reuseType: z.enum(["EXISTING_PROVEN", "ADAPTED_EXISTING", "COMPOSED_COMPONENTS", "NEW_CANDIDATE"]),
  objectiveFit: z.number().min(0).max(1), historicalSuccess: z.number().min(0).max(1),
  capabilityFit: z.number().min(0).max(1), workforceFit: z.number().min(0).max(1),
  costScore: z.number().min(0).max(1), durationScore: z.number().min(0).max(1),
  totalScore: z.number().min(0).max(1), reasons: z.array(z.string().max(240)).max(12),
}).strict();

export const ObjectiveExecutionSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  executiveGoalId: z.string().uuid(),
  organizationId: z.string().min(1).max(160).nullable(),
  status: ObjectiveExecutionStatusSchema,
  budgetCredits: z.number().int().nonnegative().max(10_000_000),
  committedCredits: z.number().int().nonnegative().max(10_000_000),
  spentCredits: z.number().int().nonnegative().max(10_000_000),
  executionProgress: z.number().min(0).max(100),
  outcomeProgress: z.number().min(0).max(100),
  strategyVersion: z.number().int().positive(),
  activationKey: z.string().max(200).nullable(),
  blockers: z.array(z.string().max(500)).max(30),
  riskReasons: z.array(z.string().max(500)).max(30).default([]),
  deadlineStatus: z.enum(["ON_TRACK", "AT_RISK", "OVERDUE"]).default("ON_TRACK"),
  budgetStatus: z.enum(["ON_TRACK", "BUDGET_AT_RISK", "EXHAUSTED"]).default("ON_TRACK"),
  projectedCost: z.number().int().nonnegative().max(10_000_000).default(0),
  lastReplanTrigger: ObjectiveReplanTriggerSchema.nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
}).strict();

export const ObjectiveProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  objectiveExecutionId: z.string().uuid(),
  title: z.string().min(1).max(160),
  outcome: z.string().min(1).max(1_000),
  status: z.enum(["PLANNED", "QUEUED", "RUNNING", "WAITING", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"]),
  sequence: z.number().int().nonnegative().max(100),
  departmentId: z.string().max(160).nullable(),
  requiredSkills: z.array(z.string().max(160)).max(20),
  requiredCapabilities: z.array(z.string().max(160)).max(20),
  capabilityReadiness: z.array(z.object({
    capabilityId: z.string().min(1).max(160),
    status: z.enum(["AVAILABLE", "REQUEST_REQUIRED"]),
  }).strict()).max(20).default([]),
  estimatedAiCostCredits: z.number().int().nonnegative().max(1_000_000).default(0),
  memoryScopeRefs: z.array(z.string().max(160)).max(20),
  budgetCredits: z.number().int().nonnegative().max(1_000_000),
  workforceTaskId: z.string().uuid().nullable(),
  workflowId: z.string().uuid().nullable(),
  selectedWorkflowTemplateId: z.string().uuid().nullable().default(null),
  workflowSelection: z.array(ObjectiveWorkflowScoreSchema).max(20).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const ObjectiveEventSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), objectiveExecutionId: z.string().uuid(),
  type: z.enum(["DRAFTED", "PLAN_CREATED", "ACTIVATED", "PAUSED", "RESUMED", "PROGRESS_UPDATED", "MONITORED", "MODIFIED", "REPLAN_PROPOSED", "REPLANNED", "BLOCKED", "COMPLETED", "CANCELLED"]),
  summary: z.string().min(1).max(1_000),
  idempotencyKey: z.string().min(8).max(200).nullable(),
  metadata: z.record(z.string().max(80), z.json()),
  createdAt: z.iso.datetime(),
}).strict();

export const ObjectiveCapabilityLinkSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), objectiveExecutionId: z.string().uuid(),
  projectId: z.string().uuid().nullable(), workflowId: z.string().uuid().nullable(), taskId: z.string().uuid().nullable(),
  requiredCapability: z.string().min(1).max(160), capabilityRequestId: z.string().uuid(),
  status: z.enum(["OPEN", "CANDIDATE_CREATED", "RESOLVED", "DISMISSED"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();

export const ObjectiveMetricObservationSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), objectiveExecutionId: z.string().uuid(),
  kpiId: z.string().uuid(), value: z.number(), observedAt: z.iso.datetime(), source: z.enum(["OWNER", "WORKFLOW", "TASK", "CALCULATED"]),
}).strict();

export const ObjectiveMetricInputSchema = z.object({
  name: z.string().min(1).max(120), unit: z.string().min(1).max(40), target: z.number(),
  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "TARGET_RANGE", "BINARY"]).default("HIGHER_IS_BETTER"),
}).strict();

export const CreateObjectiveRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  outcome: z.string().trim().min(1).max(1_000),
  deadline: z.iso.datetime().nullable().default(null),
  budgetCredits: z.number().int().min(1).max(1_000_000).default(100),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  organizationId: z.string().min(1).max(160).nullable().default(null),
  constraints: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  metrics: z.array(ObjectiveMetricInputSchema).max(10).default([]),
}).strict();

export const ObjectiveMutationRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
}).strict();
export const ModifyObjectiveRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  budgetCredits: z.number().int().min(1).max(1_000_000).optional(),
  deadline: z.iso.datetime().nullable().optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  constraints: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  metrics: z.array(ObjectiveMetricInputSchema).max(10).optional(),
}).strict().refine((value)=>value.budgetCredits!==undefined||value.deadline!==undefined||value.priority!==undefined||value.constraints!==undefined||value.metrics!==undefined,{message:"At least one objective field must be supplied."});
export const ObserveObjectiveMetricRequestSchema = z.object({
  kpiId: z.string().uuid(), value: z.number(), source: z.enum(["OWNER", "WORKFLOW", "TASK", "CALCULATED"]).default("OWNER"),
}).strict();
export const ObjectiveModificationResultSchema = z.object({
  status: z.enum(["APPLIED", "PARTIALLY_APPLIED", "REPLAN_REQUIRED", "REJECTED"]),
  appliedFields: z.array(z.string().max(80)), rejectedFields: z.array(z.string().max(80)),
  reasons: z.array(z.string().max(500)), dashboard: z.lazy(()=>ObjectiveDashboardSchema),
}).strict();

export const ObjectiveDashboardSchema = z.object({
  summary: z.object({ total: z.number().int().nonnegative(), active: z.number().int().nonnegative(), atRisk: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).strict(),
  objectives: z.array(ObjectiveExecutionSchema).max(500),
  goals: z.array(z.object({ id: z.string().uuid(), title: z.string(), description: z.string(), status: z.string(), priority: z.string(), targetDate: z.string().nullable(), successCriteria: z.array(z.string()), constraints: z.array(z.string()) }).passthrough()).max(500),
  projects: z.array(ObjectiveProjectSchema).max(2_000),
  metrics: z.array(z.object({ id: z.string().uuid(), goalId: z.string().uuid().nullable(), name: z.string(), unit: z.string(), target: z.number(), currentValue: z.number(), confidence: z.number() }).passthrough()).max(2_000),
  plans: z.array(z.object({ id: z.string().uuid(), goalId: z.string().uuid().nullable(), version: z.number(), status: z.string(), milestones: z.array(z.string()), feasibility: z.string(), confidence: z.number() }).passthrough()).max(500),
  events: z.array(ObjectiveEventSchema).max(2_000),
  capabilityRequests: z.array(ObjectiveCapabilityLinkSchema).max(2_000),
  observations: z.array(ObjectiveMetricObservationSchema).max(5_000),
  invariants: z.object({ objectiveGrantsAuthority: z.literal(false), creditsGrantAuthority: z.literal(false), executionUsesWorkforceScheduler: z.literal(true), planningUsesExecutiveBrain: z.literal(true) }).strict(),
}).strict();

export const ObjectiveDraftResponseSchema = z.object({
  objective: ObjectiveExecutionSchema.nullable(),
  projects: z.array(ObjectiveProjectSchema),
  clarificationQuestions: z.array(z.string().max(500)).max(10),
}).strict();

export type ObjectiveExecution = z.infer<typeof ObjectiveExecutionSchema>;
export type ObjectiveProject = z.infer<typeof ObjectiveProjectSchema>;
export type ObjectiveEvent = z.infer<typeof ObjectiveEventSchema>;
export type ObjectiveCapabilityLink = z.infer<typeof ObjectiveCapabilityLinkSchema>;
export type ObjectiveMetricObservation = z.infer<typeof ObjectiveMetricObservationSchema>;
export type ObjectiveReplanTrigger = z.infer<typeof ObjectiveReplanTriggerSchema>;
export type ObjectiveWorkflowScore = z.infer<typeof ObjectiveWorkflowScoreSchema>;
export type CreateObjectiveRequest = z.input<typeof CreateObjectiveRequestSchema>;
