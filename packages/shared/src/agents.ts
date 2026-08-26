import { z } from "zod";

export const AgentRoleSchema = z.enum([
  "engineering_manager",
  "planning",
  "coding",
  "review",
  "security",
  "testing",
  "documentation",
  "release",
]);

export const AgentStatusSchema = z.enum([
  "available",
  "busy",
  "paused",
  "disabled",
  "unhealthy",
]);

export const AgentTaskStatusSchema = z.enum([
  "queued",
  "assigned",
  "in_progress",
  "waiting_consensus",
  "blocked",
  "completed",
  "cancelled",
  "failed",
]);

export const AgentMessageTypeSchema = z.enum([
  "assignment",
  "status",
  "question",
  "finding",
  "review",
  "security_review",
  "test_plan",
  "documentation",
  "release_note",
  "conflict",
  "consensus_vote",
]);

export const AgentPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export const ConsensusRuleSchema = z.enum([
  "majority",
  "unanimous",
  "required_specialist",
  "owner_override",
]);

export const ConsensusStatusSchema = z.enum([
  "open",
  "passed",
  "failed",
  "owner_override_required",
]);

export const AgentRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    role: AgentRoleSchema,
    displayName: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    status: AgentStatusSchema,
    capabilities: z.array(z.string().min(3).max(120)).min(1).max(50),
    supportedTasks: z.array(z.string().min(3).max(120)).min(1).max(50),
    configuration: z.record(z.string().max(80), z.json()).default({}),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    healthSummary: z.string().min(1).max(500),
    workforce: z
      .object({
        organizationId: z.string().uuid(),
        departmentId: z.string().uuid(),
        parentAgentId: z.string().min(3).max(120).nullable(),
        managerAgentId: z.string().min(3).max(120).nullable(),
        specialization: z.string().min(1).max(160),
        description: z.string().min(1).max(500),
        skills: z.array(z.string().min(2).max(120)).min(1).max(30),
        memoryScopeId: z.string().min(3).max(160),
        departmentMemoryScopeId: z.string().min(3).max(160),
        organizationMemoryScopeId: z.string().min(3).max(160),
        capabilityProfileId: z.string().min(3).max(160),
        missingCapabilities: z.array(z.string().min(3).max(120)).max(30),
        modelPolicyId: z.enum([
          "CHEAP_ROUTINE",
          "LOCAL_FIRST",
          "BALANCED",
          "STRONG_REASONING",
          "SECURITY_REVIEW",
        ]),
        activationPolicyId: z.string().min(3).max(160),
        executionPlacement: z.enum([
          "LOCAL",
          "REMOTE_ALLOWED",
          "REMOTE_PREFERRED",
          "LOCAL_ONLY",
        ]),
        evaluationProfile: z.array(z.string().min(2).max(120)).min(1).max(20),
        source: z.enum(["ALEXA_NATIVE", "EVERYTHING_CLAUDE_CODE"]),
        sourcePath: z.string().max(500).nullable(),
        sourceVersion: z.string().max(80).nullable(),
        license: z.string().max(80).nullable(),
        importedAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AgentTaskRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    title: z.string().min(1).max(255),
    objective: z.string().min(1).max(1_000),
    status: AgentTaskStatusSchema,
    priority: AgentPrioritySchema,
    dependencies: z.array(z.string().uuid()).max(50),
    repositoryIds: z.array(z.string().uuid()).max(20),
    evidence: z.array(z.string().min(1).max(500)).max(50),
    assignedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    resultSummary: z.string().max(2_000).nullable(),
  })
  .strict();

export const AgentMessageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    senderAgentId: z.string().min(3).max(120),
    recipientAgentId: z.string().min(3).max(120),
    conversationId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    messageType: AgentMessageTypeSchema,
    payload: z.record(z.string().max(80), z.json()).default({}),
    evidence: z.array(z.string().min(1).max(500)).max(50),
    priority: AgentPrioritySchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentContextRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    contextType: z.enum([
      "repository",
      "architecture",
      "workflow",
      "execution",
      "validation",
      "conclusion",
    ]),
    version: z.number().int().positive(),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    sourceRefs: z.array(z.string().min(1).max(500)).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentConsensusRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    topic: z.string().min(1).max(500),
    rule: ConsensusRuleSchema,
    requiredAgentIds: z.array(z.string().min(3).max(120)).min(1).max(20),
    votes: z
      .array(
        z
          .object({
            agentId: z.string().min(3).max(120),
            vote: z.enum(["approve", "reject", "abstain"]),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(50),
    status: ConsensusStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentConflictRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(2_000),
    agentIds: z.array(z.string().min(3).max(120)).min(2).max(20),
    evidence: z.array(z.string().min(1).max(500)).max(50),
    status: z.enum(["open", "owner_review", "resolved", "dismissed"]),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const AgentHealthRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    state: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
    checkedAt: z.iso.datetime(),
    activeTaskCount: z.number().int().nonnegative().max(1_000),
    messageBacklog: z.number().int().nonnegative().max(10_000),
    reasonCode: z.string().min(1).max(120),
  })
  .strict();

export const AgentMetricsRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    assignedTaskCount: z.number().int().nonnegative(),
    completedTaskCount: z.number().int().nonnegative(),
    failedTaskCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
    consensusVoteCount: z.number().int().nonnegative(),
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();

export const AgentLifecycleStatusSchema = z.enum([
  "created",
  "initialising",
  "active",
  "collaborating",
  "completed",
  "archived",
]);

export const DynamicAgentOriginSchema = z.enum([
  "template",
  "synthesised",
  "promoted_candidate",
]);

export const CapabilityRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    version: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1),
    relatedCapabilityIds: z.array(z.string().min(3).max(120)).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentTemplateRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    role: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    capabilities: z.array(z.string().min(3).max(120)).min(1).max(80),
    prompt: z.string().min(1).max(4_000),
    tools: z.array(z.string().min(1).max(120)).max(50),
    allowedActions: z.array(z.string().min(1).max(120)).max(50),
    preferredModels: z.array(z.string().min(1).max(120)).max(20),
    memorySources: z.array(z.string().min(1).max(120)).max(50),
    evaluationCriteria: z.array(z.string().min(1).max(500)).max(50),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DynamicAgentRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    templateId: z.string().min(3).max(120).nullable(),
    origin: DynamicAgentOriginSchema,
    displayName: z.string().min(1).max(120),
    roleDescription: z.string().min(1).max(1_000),
    responsibilities: z.array(z.string().min(1).max(500)).min(1).max(50),
    capabilities: z.array(z.string().min(3).max(120)).min(1).max(80),
    prompt: z.string().min(1).max(4_000),
    constraints: z.array(z.string().min(1).max(500)).min(1).max(50),
    successCriteria: z.array(z.string().min(1).max(500)).min(1).max(50),
    knowledgeSources: z.array(z.string().min(1).max(500)).max(50),
    inheritedPermissionProfile: z.literal("existing_agent_permissions"),
    lifecycleStatus: AgentLifecycleStatusSchema,
    creationReason: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const AgentLifecycleEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    status: AgentLifecycleStatusSchema,
    reason: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DynamicAgentPerformanceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    tasksCompleted: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    averageCompletionTimeMs: z.number().nonnegative(),
    validationFailures: z.number().int().nonnegative(),
    reviewQuality: z.number().min(0).max(1),
    collaborationScore: z.number().min(0).max(1),
    reuseFrequency: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const TeamCompositionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    workflowId: z.string().uuid().nullable(),
    goal: z.string().min(1).max(1_000),
    requiredCapabilities: z.array(z.string().min(3).max(120)).min(1).max(100),
    reusedAgentIds: z.array(z.string().min(3).max(120)).max(100),
    dynamicAgentIds: z.array(z.string().min(3).max(120)).max(100),
    missingCapabilities: z.array(z.string().min(3).max(120)).max(100),
    riskLevel: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1).max(2_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentPromotionCandidateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    suggestedPermanentName: z.string().min(1).max(120),
    reason: z.string().min(1).max(1_000),
    usageCount: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    status: z.enum(["pending_owner_review", "accepted", "dismissed"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateAgentTaskRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(255),
    objective: z.string().trim().min(1).max(1_000),
    priority: AgentPrioritySchema.default("normal"),
    repositoryIds: z.array(z.string().uuid()).max(20).default([]),
    evidence: z.array(z.string().min(1).max(500)).max(50).default([]),
  })
  .strict();

export const CreateAgentMessageRequestSchema = z
  .object({
    senderAgentId: z.string().min(3).max(120),
    recipientAgentId: z.string().min(3).max(120),
    conversationId: z.string().uuid().optional(),
    workflowId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    messageType: AgentMessageTypeSchema,
    payload: z.record(z.string().max(80), z.json()).default({}),
    evidence: z.array(z.string().min(1).max(500)).max(50).default([]),
    priority: AgentPrioritySchema.default("normal"),
  })
  .strict();

export const CreateAgentConsensusRequestSchema = z
  .object({
    workflowId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    topic: z.string().trim().min(1).max(500),
    rule: ConsensusRuleSchema.default("required_specialist"),
    requiredAgentIds: z.array(z.string().min(3).max(120)).min(1).max(20),
  })
  .strict();

export const ComposeTeamRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    workflowId: z.string().uuid().optional(),
    repositoryIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const CapabilitySearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const RetireDynamicAgentRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000).default("Workflow completed."),
  })
  .strict();

export const AgentDashboardResponseSchema = z
  .object({
    agents: z.array(AgentRecordSchema).max(1_000),
    tasks: z.array(AgentTaskRecordSchema).max(500),
    messages: z.array(AgentMessageRecordSchema).max(500),
    contexts: z.array(AgentContextRecordSchema).max(200),
    consensus: z.array(AgentConsensusRecordSchema).max(200),
    conflicts: z.array(AgentConflictRecordSchema).max(200),
    health: z.array(AgentHealthRecordSchema).max(1_000),
    metrics: z.array(AgentMetricsRecordSchema).max(1_000),
    dynamicWorkforce: z
      .object({
        templates: z.array(AgentTemplateRecordSchema).max(100),
        capabilities: z.array(CapabilityRecordSchema).max(500),
        dynamicAgents: z.array(DynamicAgentRecordSchema).max(500),
        lifecycle: z.array(AgentLifecycleEventRecordSchema).max(500),
        performance: z.array(DynamicAgentPerformanceRecordSchema).max(500),
        teamCompositions: z.array(TeamCompositionRecordSchema).max(200),
        promotionCandidates: z.array(AgentPromotionCandidateRecordSchema).max(200),
        archivedAgents: z.array(DynamicAgentRecordSchema).max(500),
      })
      .optional(),
  })
  .strict();

export const AgentListResponseSchema = z.array(AgentRecordSchema).max(1_000);
export const AgentTaskListResponseSchema = z.array(AgentTaskRecordSchema).max(500);
export const AgentMessageListResponseSchema = z
  .array(AgentMessageRecordSchema)
  .max(500);
export const AgentConsensusListResponseSchema = z
  .array(AgentConsensusRecordSchema)
  .max(200);
export const AgentConflictListResponseSchema = z
  .array(AgentConflictRecordSchema)
  .max(200);
export const AgentHealthListResponseSchema = z.array(AgentHealthRecordSchema).max(1_000);
export const AgentMetricsListResponseSchema = z
  .array(AgentMetricsRecordSchema)
  .max(1_000);
export const AgentTaskResponseSchema = z
  .object({ task: AgentTaskRecordSchema })
  .strict();
export const AgentMessageResponseSchema = z
  .object({ message: AgentMessageRecordSchema })
  .strict();
export const AgentConsensusResponseSchema = z
  .object({ consensus: AgentConsensusRecordSchema })
  .strict();
export const AgentTemplateListResponseSchema = z
  .array(AgentTemplateRecordSchema)
  .max(100);
export const CapabilityListResponseSchema = z.array(CapabilityRecordSchema).max(500);
export const DynamicAgentListResponseSchema = z
  .array(DynamicAgentRecordSchema)
  .max(500);
export const AgentLifecycleListResponseSchema = z
  .array(AgentLifecycleEventRecordSchema)
  .max(500);
export const AgentPerformanceListResponseSchema = z
  .array(DynamicAgentPerformanceRecordSchema)
  .max(500);
export const TeamCompositionListResponseSchema = z
  .array(TeamCompositionRecordSchema)
  .max(200);
export const AgentPromotionListResponseSchema = z
  .array(AgentPromotionCandidateRecordSchema)
  .max(200);
export const TeamCompositionResponseSchema = z
  .object({
    composition: TeamCompositionRecordSchema,
    dynamicAgents: z.array(DynamicAgentRecordSchema).max(100),
  })
  .strict();
export const DynamicWorkforceDashboardResponseSchema =
  AgentDashboardResponseSchema.shape.dynamicWorkforce.unwrap();

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentPriority = z.infer<typeof AgentPrioritySchema>;
export type AgentRecord = z.infer<typeof AgentRecordSchema>;
export type AgentTaskRecord = z.infer<typeof AgentTaskRecordSchema>;
export type AgentMessageRecord = z.infer<typeof AgentMessageRecordSchema>;
export type AgentContextRecord = z.infer<typeof AgentContextRecordSchema>;
export type AgentConsensusRecord = z.infer<typeof AgentConsensusRecordSchema>;
export type AgentConflictRecord = z.infer<typeof AgentConflictRecordSchema>;
export type AgentHealthRecord = z.infer<typeof AgentHealthRecordSchema>;
export type AgentMetricsRecord = z.infer<typeof AgentMetricsRecordSchema>;
export type CapabilityRecord = z.infer<typeof CapabilityRecordSchema>;
export type AgentTemplateRecord = z.infer<typeof AgentTemplateRecordSchema>;
export type DynamicAgentRecord = z.infer<typeof DynamicAgentRecordSchema>;
export type AgentLifecycleEventRecord = z.infer<typeof AgentLifecycleEventRecordSchema>;
export type DynamicAgentPerformanceRecord = z.infer<
  typeof DynamicAgentPerformanceRecordSchema
>;
export type TeamCompositionRecord = z.infer<typeof TeamCompositionRecordSchema>;
export type AgentPromotionCandidateRecord = z.infer<
  typeof AgentPromotionCandidateRecordSchema
>;
export type CreateAgentTaskRequest = z.infer<typeof CreateAgentTaskRequestSchema>;
export type CreateAgentMessageRequest = z.infer<typeof CreateAgentMessageRequestSchema>;
export type CreateAgentConsensusRequest = z.infer<
  typeof CreateAgentConsensusRequestSchema
>;
export type ComposeTeamRequest = z.infer<typeof ComposeTeamRequestSchema>;
