import { z } from "zod";

const boundedRef = z.string().min(1).max(160);

export const WorkforceTaskStatusSchema = z.enum([
  "CREATED", "QUEUED", "MATCHING", "ASSIGNED", "RESERVED", "RUNNING",
  "WAITING", "REVIEW_REQUIRED", "RECOVERY_REVIEW_REQUIRED", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED",
]);

export const WorkforceMessageTypeSchema = z.enum([
  "TASK", "RESULT", "QUESTION", "ANSWER", "DELEGATION", "REVIEW_REQUEST",
  "REVIEW_RESULT", "CAPABILITY_REQUEST", "ESCALATION", "PROPOSAL", "EVIDENCE",
  "STATUS_UPDATE",
]);

export const WorkforceReviewVerdictSchema = z.enum(["PASS", "FAIL", "CONDITIONAL"]);

export const WorkforceCandidateCategorySchema = z.enum([
  "EXACT_MATCH",
  "STRONG_MATCH",
  "ADAPTABLE_MATCH",
  "WEAK_MATCH",
  "INELIGIBLE",
]);

export const WorkforceGapDecisionSchema = z.enum([
  "ASSIGN_EXISTING",
  "ADAPT_EXISTING",
  "SPECIALIST_APPROVAL_PENDING",
  "SPECIALIST_CREATED",
  "CAPABILITY_REQUESTED",
  "BLOCKED",
]);

export const WorkforceMatchScoreSchema = z.object({
  agentId: boundedRef,
  category: WorkforceCandidateCategorySchema.default("WEAK_MATCH"),
  skillFit: z.number().min(0).max(1),
  capabilityFit: z.number().min(0).max(1),
  domainExperience: z.number().min(0).max(1).default(0.5),
  historicalTaskSimilarity: z.number().min(0).max(1).default(0.5),
  reputation: z.number().min(0).max(1),
  calibration: z.number().min(0).max(1),
  costEfficiency: z.number().min(0).max(1),
  availability: z.number().min(0).max(1),
  departmentFit: z.number().min(0).max(1),
  capacityPenalty: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  predictedSuccess: z.number().min(0).max(1),
  estimatedCost: z.number().int().nonnegative().max(1_000_000),
  estimatedDurationMs: z.number().int().nonnegative().max(86_400_000),
  eligible: z.boolean(),
  reasons: z.array(z.string().min(1).max(200)).max(20),
  rejectionReasons: z.array(z.string().min(1).max(200)).max(20).default([]),
}).strict();

export const SpecialistRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  objectiveId: boundedRef.nullable(),
  projectId: boundedRef.nullable(),
  taskId: z.string().uuid().nullable(),
  companyId: boundedRef.nullable(),
  departmentAffinity: boundedRef.nullable(),
  taskType: boundedRef,
  domain: boundedRef,
  requiredSkills: z.array(boundedRef).max(30),
  preferredSkills: z.array(boundedRef).max(30).default([]),
  requiredCapabilities: z.array(boundedRef).max(30),
  preferredCapabilities: z.array(boundedRef).max(30).default([]),
  memoryRequirements: z.array(boundedRef).max(20),
  authorityRequirements: z.array(boundedRef).max(20).default([]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  expectedDurationMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  estimatedCost: z.number().int().nonnegative().max(1_000_000).nullable(),
}).strict();

export const WorkforceSpecialistProposalSchema = z.object({
  proposalId: z.string().uuid(),
  requirementId: z.string().uuid(),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  departmentId: boundedRef.nullable(),
  departmentName: z.string().min(1).max(120).nullable(),
  description: z.string().min(1).max(500),
  skills: z.array(boundedRef).min(1).max(30),
  capabilities: z.array(boundedRef).min(1).max(30),
  missingCapabilities: z.array(boundedRef).max(30),
  memoryScope: boundedRef,
  authority: z.array(boundedRef).max(20),
  modelPolicyId: z.string().min(1).max(120),
  economyPolicy: z.string().min(1).max(160),
  reportsToAgentId: boundedRef.nullable(),
  delegationPermissions: z.array(boundedRef).max(20),
  approvalBoundaries: z.array(z.string().min(1).max(240)).max(20),
  recommendation: z.enum(["TEMPORARY", "REUSABLE"]),
  rationale: z.string().min(1).max(1_000),
}).strict();

export const WorkforceGapResolutionSchema = z.object({
  requirement: SpecialistRequirementSchema,
  decision: WorkforceGapDecisionSchema,
  selectedAgentId: boundedRef.nullable(),
  selectedCategory: WorkforceCandidateCategorySchema.nullable(),
  proposal: WorkforceSpecialistProposalSchema.nullable(),
  missingCapabilities: z.array(boundedRef).max(30),
  blockerCode: z.enum([
    "NO_ELIGIBLE_AGENT",
    "SPECIALIST_CREATION_REQUIRED",
    "SPECIALIST_APPROVAL_PENDING",
    "CAPABILITY_MISSING",
    "SKILL_GAP",
    "ECONOMY_RESERVATION_FAILED",
  ]).nullable(),
  reasons: z.array(z.string().min(1).max(240)).max(20),
}).strict();

export const WorkforceRuntimeTaskSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200).nullable(),
  ownerId: z.string().uuid(),
  organizationId: boundedRef.nullable(),
  createdByAgentId: boundedRef.nullable(),
  assignedAgentId: boundedRef.nullable(),
  parentTaskId: z.string().uuid().nullable(),
  rootTaskId: z.string().uuid(),
  depth: z.number().int().min(0).max(4),
  type: z.enum(["WORK", "QUESTION", "REVIEW", "CAPABILITY_REQUEST"]),
  title: z.string().trim().min(1).max(255),
  objective: z.string().trim().min(1).max(2_000),
  inputs: z.record(z.string().max(80), z.json()).default({}),
  evidenceRefs: z.array(boundedRef).max(50),
  memoryScopeRefs: z.array(boundedRef).max(20),
  requiredSkills: z.array(boundedRef).max(30),
  requiredCapabilities: z.array(boundedRef).max(30),
  preferredDepartmentId: boundedRef.nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  economicBudget: z.number().int().nonnegative().max(1_000_000),
  reservedCredits: z.number().int().nonnegative().max(1_000_000),
  actualCost: z.number().int().nonnegative().max(1_000_000),
  reservationId: z.string().uuid().nullable(),
  status: WorkforceTaskStatusSchema,
  retryCount: z.number().int().min(0).max(2),
  maxRetries: z.number().int().min(0).max(2),
  selection: z.array(WorkforceMatchScoreSchema).max(20),
  requirement: SpecialistRequirementSchema.nullable().default(null),
  workforceGap: WorkforceGapResolutionSchema.nullable().default(null),
  resultSummary: z.string().max(4_000).nullable(),
  resultConfidence: z.number().min(0).max(1).nullable(),
  aiRequestId: z.string().uuid().nullable(),
  providerId: z.string().max(80).nullable(),
  modelId: z.string().max(160).nullable(),
  sandboxStatus: z.enum(["NOT_REQUESTED", "PASSED", "FAILED", "UNAVAILABLE", "TIMED_OUT"]).nullable(),
  artifactCount: z.number().int().nonnegative().max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
}).strict();

export const WorkforceRuntimeMessageSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), organizationId: boundedRef.nullable(),
  fromAgentId: boundedRef, toAgentId: boundedRef.nullable(), taskId: z.string().uuid(),
  type: WorkforceMessageTypeSchema, payload: z.record(z.string().max(80), z.json()).default({}),
  evidenceRefs: z.array(boundedRef).max(50), createdAt: z.iso.datetime(),
}).strict();

export const WorkforceRuntimeReviewSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), taskId: z.string().uuid(),
  reviewerAgentId: boundedRef, subjectAgentId: boundedRef,
  verdict: WorkforceReviewVerdictSchema, findings: z.array(z.string().min(1).max(1_000)).max(50),
  evidenceRefs: z.array(boundedRef).max(50), createdAt: z.iso.datetime(),
}).strict();

export const CreateWorkforceTaskRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200).nullable().default(null),
  createdByAgentId: boundedRef.nullable().default(null), parentTaskId: z.string().uuid().nullable().default(null),
  assignedAgentId: boundedRef.nullable().default(null), type: z.enum(["WORK", "QUESTION", "REVIEW"]).default("WORK"),
  title: z.string().trim().min(1).max(255), objective: z.string().trim().min(1).max(2_000),
  inputs: z.record(z.string().max(80), z.json()).default({}), evidenceRefs: z.array(boundedRef).max(50).default([]),
  memoryScopeRefs: z.array(boundedRef).max(20).default([]),
  requiredSkills: z.array(boundedRef).max(30).default([]), requiredCapabilities: z.array(boundedRef).max(30).default([]),
  preferredDepartmentId: boundedRef.nullable().default(null), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"), economicBudget: z.number().int().min(1).max(1_000_000).default(10),
  maxRetries: z.number().int().min(0).max(2).default(1), expiresAt: z.iso.datetime().nullable().default(null),
}).strict();

export const CreateWorkforceMessageRequestSchema = z.object({
  fromAgentId: boundedRef, toAgentId: boundedRef.nullable().default(null), taskId: z.string().uuid(),
  type: WorkforceMessageTypeSchema, payload: z.record(z.string().max(80), z.json()).default({}),
  evidenceRefs: z.array(boundedRef).max(50).default([]),
}).strict();

export const CompleteWorkforceTaskRequestSchema = z.object({
  resultSummary: z.string().trim().min(1).max(4_000), resultConfidence: z.number().min(0).max(1),
  actualCost: z.number().int().nonnegative().max(1_000_000), evidenceRefs: z.array(boundedRef).max(50).default([]),
  reviewRequired: z.boolean().default(false),
}).strict();

export const SubmitWorkforceReviewRequestSchema = z.object({
  reviewerAgentId: boundedRef, verdict: WorkforceReviewVerdictSchema,
  findings: z.array(z.string().min(1).max(1_000)).max(50).default([]), evidenceRefs: z.array(boundedRef).max(50).default([]),
}).strict();

export const WorkforceRuntimeDashboardSchema = z.object({
  summary: z.object({ registered: z.number().int().nonnegative(), active: z.number().int().nonnegative(), dormant: z.number().int().nonnegative(), queued: z.number().int().nonnegative(), running: z.number().int().nonnegative(), waitingReview: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), maxConcurrent: z.number().int().positive() }).strict(),
  tasks: z.array(WorkforceRuntimeTaskSchema).max(500), messages: z.array(WorkforceRuntimeMessageSchema).max(500),
  reviews: z.array(WorkforceRuntimeReviewSchema).max(500),
  metrics: z.object({ assignments: z.number().int().nonnegative(), providerCalls: z.number().int().nonnegative(), matchingLatencyMs: z.number().nonnegative(), peakActiveAgents: z.number().int().nonnegative(), completionRate: z.number().min(0).max(1) }).strict(),
  invariants: z.object({ sharedAIRouter: z.literal(true), dedicatedModelPerAgent: z.literal(false), hierarchyGrantsAuthority: z.literal(false), creditsGrantAuthority: z.literal(false), maxTaskDepth: z.literal(4) }).strict(),
}).strict();

export const WorkforceRuntimeTaskResponseSchema = z.object({ task: WorkforceRuntimeTaskSchema }).strict();
export const WorkforceRuntimeMessageResponseSchema = z.object({ message: WorkforceRuntimeMessageSchema }).strict();
export const WorkforceRuntimeReviewResponseSchema = z.object({ task: WorkforceRuntimeTaskSchema, review: WorkforceRuntimeReviewSchema }).strict();

export type WorkforceRuntimeTask = z.infer<typeof WorkforceRuntimeTaskSchema>;
export type WorkforceRuntimeMessage = z.infer<typeof WorkforceRuntimeMessageSchema>;
export type WorkforceRuntimeReview = z.infer<typeof WorkforceRuntimeReviewSchema>;
export type WorkforceMatchScore = z.infer<typeof WorkforceMatchScoreSchema>;
export type SpecialistRequirement = z.infer<typeof SpecialistRequirementSchema>;
export type WorkforceGapResolution = z.infer<typeof WorkforceGapResolutionSchema>;
export type WorkforceSpecialistProposal = z.infer<typeof WorkforceSpecialistProposalSchema>;
export type CreateWorkforceTaskRequest = z.input<typeof CreateWorkforceTaskRequestSchema>;
export type CreateWorkforceMessageRequest = z.input<typeof CreateWorkforceMessageRequestSchema>;
export type CompleteWorkforceTaskRequest = z.input<typeof CompleteWorkforceTaskRequestSchema>;
export type SubmitWorkforceReviewRequest = z.input<typeof SubmitWorkforceReviewRequestSchema>;
