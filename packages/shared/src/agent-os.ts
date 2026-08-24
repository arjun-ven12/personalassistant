import { z } from "zod";

export const AgentOsStatusSchema = z.enum([
  "registered",
  "idle",
  "preparing",
  "running",
  "waiting",
  "collaborating",
  "reviewing",
  "completed",
  "failed",
  "archived",
]);

export const AgentOsEventTypeSchema = z.enum([
  "AgentCreated",
  "AgentStarted",
  "AgentPaused",
  "AgentResumed",
  "AgentCompleted",
  "AgentFailed",
  "CapabilityLoaded",
  "ToolInvoked",
  "MemoryUpdated",
  "KnowledgeRetrieved",
  "WorkflowJoined",
  "WorkflowLeft",
  "ContextPackaged",
  "DelegationStarted",
  "DelegationCompleted",
  "DelegationFailed",
  "ConfigurationChanged",
  "PackageValidated",
]);

export const PermissionProfileRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    repositoryAccess: z.enum(["none", "assigned", "registered_read_only"]),
    filesystemAccess: z.enum(["none", "registered_read_only"]),
    memoryAccess: z.enum(["none", "owner_scoped_read", "owner_scoped_read_write"]),
    workflowAccess: z.enum(["none", "assigned", "owner_scoped"]),
    apiAccess: z.enum(["none", "owner_authenticated_read"]),
    externalServices: z.enum(["none", "approved_integrations_only"]),
    toolPermissions: z.array(z.string().min(1).max(120)).max(100),
    deploymentPermissions: z.literal("none"),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RuntimeConfigurationSchema = z
  .object({
    defaultModel: z.string().min(1).max(120),
    fallbackModel: z.string().min(1).max(120).nullable(),
    temperature: z.number().min(0).max(2),
    contextLimitTokens: z.number().int().min(1_000).max(1_000_000),
    executionTimeoutSeconds: z.number().int().min(1).max(86_400),
    retryPolicy: z
      .object({
        maxRetries: z.number().int().min(0).max(10),
        backoff: z.enum(["none", "linear", "exponential"]),
      })
      .strict(),
    memoryLimitItems: z.number().int().min(0).max(10_000),
    reflectionEnabled: z.boolean(),
    planningDepth: z.number().int().min(0).max(20),
    parallelism: z.number().int().min(1).max(100),
    toolPreferences: z.array(z.string().min(1).max(120)).max(100),
    loggingLevel: z.enum(["debug", "info", "warn", "error"]),
    debugMode: z.boolean(),
  })
  .strict();

export const MemoryConfigurationSchema = z
  .object({
    enabled: z.boolean(),
    maxRetrievedItems: z.number().int().min(0).max(1_000),
    writable: z.boolean(),
    allowedTypes: z
      .array(
        z.enum([
          "episodic",
          "semantic",
          "procedural",
          "preference",
          "repository",
          "agent",
        ]),
      )
      .max(20),
  })
  .strict();

export const ToolRegistryRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    inputs: z.array(z.string().min(1).max(120)).max(100),
    outputs: z.array(z.string().min(1).max(120)).max(100),
    authentication: z.enum(["none", "owner_session", "signed_device", "integration"]),
    permissions: z.array(z.string().min(1).max(120)).max(100),
    executionPolicy: z.enum(["advisory_only", "approval_required", "unavailable"]),
    rateLimit: z.string().min(1).max(120),
    availability: z.enum(["available", "disabled", "unavailable"]),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const KnowledgeSourceRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    sourceType: z.enum([
      "repository",
      "architecture",
      "knowledge_graph",
      "documentation",
      "memory",
      "user_preferences",
      "project_history",
      "design_decisions",
      "previous_workflows",
    ]),
    mountPolicy: z.enum(["always", "on_demand", "disabled"]),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentManifestRecordSchema = z
  .object({
    id: z.string().min(3).max(120),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    agentType: z.enum(["permanent", "dynamic"]),
    templateSource: z.string().min(1).max(120).nullable(),
    version: z.string().min(1).max(40),
    status: AgentOsStatusSchema,
    runtimeConfiguration: RuntimeConfigurationSchema,
    memoryConfiguration: MemoryConfigurationSchema,
    capabilityRefs: z.array(z.string().min(3).max(120)).max(100),
    toolRefs: z.array(z.string().min(3).max(120)).max(100),
    permissionProfileId: z.string().min(3).max(120),
    knowledgeSourceRefs: z.array(z.string().min(3).max(120)).max(100),
    workflowRoles: z.array(z.string().min(1).max(120)).max(50),
    evaluationStrategy: z.string().min(1).max(1_000),
    lifecycleRules: z.array(z.string().min(1).max(500)).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentConfigurationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    configuration: RuntimeConfigurationSchema,
    signedChangeRequired: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentPackageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    manifest: AgentManifestRecordSchema,
    prompt: z.string().min(1).max(4_000),
    memorySchemaVersion: z.string().min(1).max(40),
    packageVersion: z.string().min(1).max(40),
    integrityHash: z.string().length(64),
    exportable: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    status: z.enum(["preparing", "running", "completed", "failed", "cancelled"]),
    inputSummary: z.string().min(1).max(1_000),
    outputSummary: z.string().max(2_000).nullable(),
    toolCallCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
    errorCode: z.string().max(120).nullable(),
    delegation: z
      .object({
        delegationId: z.string().uuid(),
        managerAgentId: z.string().min(3).max(120),
        memoryScopes: z.array(z.string().min(1).max(40)).max(20),
        capabilityRefs: z.array(z.string().min(3).max(120)).max(100),
        skillRefs: z.array(z.string().min(3).max(120)).max(100),
        contextTokenBudget: z.number().int().min(1_000).max(100_000),
        sandboxProfileId: z.string().min(3).max(120),
        aiRequestId: z.string().uuid().nullable(),
        providerId: z.string().max(80).nullable(),
        modelId: z.string().max(160).nullable(),
        sandboxStatus: z.enum([
          "NOT_REQUESTED",
          "PENDING",
          "RUNNING",
          "PASSED",
          "FAILED",
          "UNAVAILABLE",
        ]),
        artifactCount: z.number().int().nonnegative().max(50),
        resultConfidence: z.number().min(0).max(1).nullable(),
      })
      .strict()
      .nullable()
      .default(null),
    reasoningStatistics: z
      .object({
        steps: z.number().int().nonnegative(),
        confidence: z.number().min(0).max(1),
        memoryRetrievalCount: z.number().int().nonnegative(),
        knowledgeRetrievalCount: z.number().int().nonnegative(),
      })
      .strict(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const RuntimeEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    sessionId: z.string().uuid().nullable(),
    workflowId: z.string().uuid().nullable(),
    eventType: AgentOsEventTypeSchema,
    summary: z.string().min(1).max(1_000),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ContextPackageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().nullable(),
    repositoryRefs: z.array(z.string().uuid()).max(100),
    memoryRefs: z.array(z.string().uuid()).max(100),
    decisionRefs: z.array(z.string().uuid()).max(100),
    knowledgeSourceRefs: z.array(z.string().min(3).max(120)).max(100),
    capabilityRefs: z.array(z.string().min(3).max(120)).max(100),
    summary: z.string().min(1).max(2_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentOsHealthRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    availability: z.enum(["available", "degraded", "unavailable", "archived"]),
    latencyMs: z.number().nonnegative(),
    memoryUsageEstimate: z.number().int().nonnegative(),
    failureRate: z.number().min(0).max(1),
    recoveryRate: z.number().min(0).max(1),
    successRate: z.number().min(0).max(1),
    toolReliability: z.number().min(0).max(1),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export const AgentOsMetricsRecordSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    executions: z.number().int().nonnegative(),
    successfulExecutions: z.number().int().nonnegative(),
    failedExecutions: z.number().int().nonnegative(),
    averageRuntimeMs: z.number().nonnegative(),
    averageReasoningDepth: z.number().nonnegative(),
    memoryRetrievalCount: z.number().int().nonnegative(),
    toolUsageCount: z.number().int().nonnegative(),
    capabilityUsageCount: z.number().int().nonnegative(),
    knowledgeRetrievalCount: z.number().int().nonnegative(),
    confidenceTrend: z.number().min(0).max(1),
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const AgentVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    version: z.string().min(1).max(40),
    changeType: z.enum([
      "manifest",
      "capability",
      "configuration",
      "prompt",
      "tool",
      "permission",
      "memory_schema",
    ]),
    summary: z.string().min(1).max(1_000),
    rollbackAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CreateAgentSessionRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    workflowId: z.string().uuid().optional(),
    inputSummary: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const AgentOsDashboardResponseSchema = z
  .object({
    manifests: z.array(AgentManifestRecordSchema).max(500),
    packages: z.array(AgentPackageRecordSchema).max(500),
    sessions: z.array(AgentSessionRecordSchema).max(500),
    events: z.array(RuntimeEventRecordSchema).max(500),
    configurations: z.array(AgentConfigurationRecordSchema).max(500),
    tools: z.array(ToolRegistryRecordSchema).max(500),
    permissionProfiles: z.array(PermissionProfileRecordSchema).max(100),
    knowledgeSources: z.array(KnowledgeSourceRecordSchema).max(500),
    health: z.array(AgentOsHealthRecordSchema).max(500),
    metrics: z.array(AgentOsMetricsRecordSchema).max(500),
    versions: z.array(AgentVersionRecordSchema).max(500),
    contextPackages: z.array(ContextPackageRecordSchema).max(500),
    runtimeIsolation: z.literal(true),
    advisoryOnly: z.literal(true),
  })
  .strict();

export const AgentManifestListResponseSchema = z
  .array(AgentManifestRecordSchema)
  .max(500);
export const AgentPackageListResponseSchema = z
  .array(AgentPackageRecordSchema)
  .max(500);
export const AgentSessionListResponseSchema = z
  .array(AgentSessionRecordSchema)
  .max(500);
export const RuntimeEventListResponseSchema = z
  .array(RuntimeEventRecordSchema)
  .max(500);
export const AgentConfigurationListResponseSchema = z
  .array(AgentConfigurationRecordSchema)
  .max(500);
export const ToolRegistryListResponseSchema = z
  .array(ToolRegistryRecordSchema)
  .max(500);
export const PermissionProfileListResponseSchema = z
  .array(PermissionProfileRecordSchema)
  .max(100);
export const KnowledgeSourceListResponseSchema = z
  .array(KnowledgeSourceRecordSchema)
  .max(500);
export const AgentOsHealthListResponseSchema = z
  .array(AgentOsHealthRecordSchema)
  .max(500);
export const AgentOsMetricsListResponseSchema = z
  .array(AgentOsMetricsRecordSchema)
  .max(500);
export const AgentVersionListResponseSchema = z
  .array(AgentVersionRecordSchema)
  .max(500);
export const ContextPackageListResponseSchema = z
  .array(ContextPackageRecordSchema)
  .max(500);
export const AgentSessionResponseSchema = z
  .object({ session: AgentSessionRecordSchema })
  .strict();

export type AgentManifestRecord = z.infer<typeof AgentManifestRecordSchema>;
export type AgentPackageRecord = z.infer<typeof AgentPackageRecordSchema>;
export type AgentSessionRecord = z.infer<typeof AgentSessionRecordSchema>;
export type RuntimeEventRecord = z.infer<typeof RuntimeEventRecordSchema>;
export type AgentConfigurationRecord = z.infer<typeof AgentConfigurationRecordSchema>;
export type ToolRegistryRecord = z.infer<typeof ToolRegistryRecordSchema>;
export type PermissionProfileRecord = z.infer<typeof PermissionProfileRecordSchema>;
export type KnowledgeSourceRecord = z.infer<typeof KnowledgeSourceRecordSchema>;
export type ContextPackageRecord = z.infer<typeof ContextPackageRecordSchema>;
export type AgentOsHealthRecord = z.infer<typeof AgentOsHealthRecordSchema>;
export type AgentOsMetricsRecord = z.infer<typeof AgentOsMetricsRecordSchema>;
export type AgentVersionRecord = z.infer<typeof AgentVersionRecordSchema>;
export type CreateAgentSessionRequest = z.infer<typeof CreateAgentSessionRequestSchema>;
export type RuntimeConfiguration = z.infer<typeof RuntimeConfigurationSchema>;
export type MemoryConfiguration = z.infer<typeof MemoryConfigurationSchema>;
