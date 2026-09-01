import { z } from "zod";

const uuid = z.string().uuid();
const boundedKey = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const reference = z.string().trim().min(1).max(240);

export const DurabilityClassSchema = z.enum([
  "EPHEMERAL",
  "DURABLE",
  "LONG_RUNNING",
  "EXTERNAL_WAIT",
  "APPROVAL_WAIT",
  "CROSS_COMPANY",
]);
export const CrossCompanySharingScopeSchema = z.enum([
  "NONE",
  "SUMMARY_ONLY",
  "SPECIFIC_ARTIFACTS",
  "SPECIFIC_DATASET",
  "SPECIFIC_METRICS",
  "TASK_BOUND_CONTEXT",
]);
export const CrossCompanyServiceStatusSchema = z.enum([
  "REQUESTED",
  "NEEDS_APPROVAL",
  "ACCEPTED",
  "RUNNING",
  "WAITING",
  "REVIEW",
  "COMPLETED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "BUDGET_BLOCKED",
]);
export const ServiceCostAttributionSchema = z.enum([
  "SOURCE_PAYS",
  "DESTINATION_PAYS",
  "SHARED",
  "OWNER_PORTFOLIO",
]);
export const DurableExecutionStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "WAITING_EXTERNAL",
  "PAUSED",
  "REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const DurableFailureClassSchema = z.enum([
  "TRANSIENT",
  "PERMANENT",
  "POLICY",
  "APPROVAL",
  "CREDENTIAL",
  "BUDGET",
  "VALIDATION",
  "INFRASTRUCTURE",
]);

export const CrossCompanySharedInputSchema = z
  .object({
    scope: CrossCompanySharingScopeSchema,
    artifactRefs: z.array(reference).max(40),
    metricRefs: z.array(reference).max(40),
    contextRefs: z.array(reference).max(40),
    summary: z.string().trim().max(4_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.scope === "NONE" &&
      (value.artifactRefs.length ||
        value.metricRefs.length ||
        value.contextRefs.length ||
        value.summary)
    )
      context.addIssue({
        code: "custom",
        message: "NONE sharing cannot carry input references.",
      });
    if (value.scope === "SPECIFIC_ARTIFACTS" && !value.artifactRefs.length)
      context.addIssue({
        code: "custom",
        message: "Artifact sharing requires explicit artifact references.",
      });
    if (value.scope === "SPECIFIC_METRICS" && !value.metricRefs.length)
      context.addIssue({
        code: "custom",
        message: "Metric sharing requires explicit metric references.",
      });
  });

export const CrossCompanyServiceResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(8_000),
    structuredResult: z.json().nullable(),
    artifactRefs: z.array(reference).max(40),
    metricRefs: z.array(reference).max(40),
    evidenceRefs: z.array(reference).max(80),
    verification: z.enum(["VERIFIED", "FAILED", "NOT_VERIFIED"]),
    reviewOutcome: z.enum(["PASS", "FAIL", "NOT_REVIEWED"]),
  })
  .strict();

export const CrossCompanyWorkforceResolutionSchema = z
  .object({
    selectedAssignmentId: uuid,
    selectedDefinitionId: reference,
    decision: z.enum(["EXISTING", "LAZY_ACTIVATION", "CATALOG_ASSIGNMENT"]),
    candidateAssignmentIds: z.array(uuid).max(100),
    catalogMatchDefinitionId: reference.nullable(),
    assignmentCreated: z.boolean(),
    capabilityBlockers: z.array(reference).max(100),
    evidence: z.array(z.string().trim().min(1).max(300)).max(40),
    resolvedAt: z.iso.datetime(),
  })
  .strict();

export const CrossCompanyCollaborationPolicySchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    allowedDestinationCompanyIds: z.array(uuid).max(100),
    allowedServiceTypes: z.array(boundedKey).max(100),
    allowedSharingScopes: z.array(CrossCompanySharingScopeSchema).max(6),
    allowedCapabilities: z.array(boundedKey).max(100),
    maxBudgetCredits: z.number().int().nonnegative().max(1_000_000),
    approvalThresholdCredits: z.number().int().nonnegative().max(1_000_000),
    maxConcurrentServices: z.number().int().min(1).max(100),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CrossCompanyServiceRequestSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    sourceCompanyId: uuid,
    destinationCompanyId: uuid,
    requesterAssignmentId: uuid.nullable(),
    destinationGovernorAssignmentId: uuid.nullable(),
    destinationAssignmentId: uuid.nullable(),
    serviceType: boundedKey,
    requestedOutcome: z.string().trim().min(1).max(4_000),
    objectiveId: uuid.nullable(),
    workflowId: uuid.nullable(),
    requestedCapabilities: z.array(boundedKey).max(100),
    sharedInput: CrossCompanySharedInputSchema,
    permittedOutputTypes: z
      .array(z.enum(["STRUCTURED_RESULT", "ARTIFACTS", "METRICS", "EVIDENCE"]))
      .min(1)
      .max(4),
    confidentiality: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]),
    budgetCredits: z.number().int().positive().max(1_000_000),
    costAttribution: ServiceCostAttributionSchema,
    actualCostCredits: z.number().nonnegative(),
    payingCompanyId: uuid.nullable().default(null),
    payingAssignmentId: uuid.nullable().default(null),
    estimatedCostCredits: z.number().int().nonnegative().default(0),
    reservedCostCredits: z.number().int().nonnegative().default(0),
    settledCostCredits: z.number().int().nonnegative().default(0),
    economyReservationId: uuid.nullable().default(null),
    economyState: z.enum(["NONE", "RESERVED", "SETTLED", "RELEASED"]).default("NONE"),
    workforceResolution: CrossCompanyWorkforceResolutionSchema.nullable().default(null),
    deadline: z.iso.datetime().nullable(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
    status: CrossCompanyServiceStatusSchema,
    approvalRequirement: z.enum(["NONE", "EXPLICIT", "RECENT_AUTHENTICATION"]),
    approvalId: uuid.nullable(),
    durabilityClass: z.literal("CROSS_COMPANY"),
    traceId: z.string().min(16).max(64),
    currentStep: boundedKey.nullable(),
    waitReason: z.string().trim().max(500).nullable(),
    result: CrossCompanyServiceResultSchema.nullable(),
    failureClass: DurableFailureClassSchema.nullable(),
    failureCode: boundedKey.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .refine((value) => value.sourceCompanyId !== value.destinationCompanyId, {
    message:
      "Cross-company services require different source and destination companies.",
  });

export const DurableExecutionSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    serviceRequestId: uuid.nullable(),
    objectiveId: uuid.nullable(),
    workflowId: uuid.nullable(),
    deterministicKey: z.string().min(1).max(300),
    durabilityClass: DurabilityClassSchema,
    backend: z.enum(["NATIVE_POSTGRES", "TEMPORAL"]),
    backendWorkflowId: z.string().min(1).max(500),
    status: DurableExecutionStatusSchema,
    currentStep: boundedKey.nullable(),
    attempt: z.number().int().nonnegative().max(100),
    maxAttempts: z.number().int().min(1).max(100),
    nextRunAt: z.iso.datetime().nullable(),
    cancellationRequested: z.boolean(),
    version: z.number().int().positive(),
    traceId: z.string().min(16).max(64),
    leaseOwner: reference.nullable().default(null),
    leaseAcquiredAt: z.iso.datetime().nullable().default(null),
    leaseExpiresAt: z.iso.datetime().nullable().default(null),
    lastHeartbeatAt: z.iso.datetime().nullable().default(null),
    leaseGeneration: z.number().int().nonnegative().default(0),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const DurableExecutionEventSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    executionId: uuid,
    sequence: z.number().int().positive(),
    eventType: boundedKey,
    step: boundedKey.nullable(),
    summary: z.string().trim().min(1).max(1_000),
    metadata: z.record(
      z.string().min(1).max(80),
      z.union([z.string().max(240), z.number(), z.boolean(), z.null()]),
    ),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DurableActivityReceiptSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    executionId: uuid,
    step: boundedKey,
    idempotencyKey: z.string().min(16).max(300),
    status: z.enum(["STARTED", "COMMITTED", "RECONCILIATION_REQUIRED", "FAILED"]),
    externalCommitRef: reference.nullable(),
    resultSummary: z.string().trim().max(2_000).nullable(),
    requestDigest: z.string().length(64).nullable().default(null),
    commitEvidenceRef: reference.nullable().default(null),
    resultRef: reference.nullable().default(null),
    attempt: z.number().int().positive().max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SandboxNetworkPolicySchema = z.enum([
  "DENY_ALL",
  "ALLOWLIST",
  "APPROVED_INTERNET",
]);
export const SandboxLanguageSchema = z.enum(["PYTHON", "NODE"]);
export const SandboxExecutionRequestSchema = z
  .object({
    ownerId: uuid,
    companyId: uuid,
    assignmentId: uuid,
    taskId: uuid,
    language: SandboxLanguageSchema,
    codeArtifactRef: reference,
    inputArtifactRefs: z.array(reference).max(40),
    networkPolicy: SandboxNetworkPolicySchema.default("DENY_ALL"),
    networkAllowlist: z.array(z.string().trim().min(1).max(253)).max(40),
    resourceLimits: z
      .object({
        cpuCores: z.number().positive().max(2),
        memoryMb: z.number().int().min(64).max(2_048),
        diskMb: z.number().int().min(16).max(4_096),
        processCount: z.number().int().min(1).max(128),
      })
      .strict(),
    timeoutMs: z.number().int().min(100).max(300_000),
    allowedSecretRefs: z.array(reference).max(10),
    expectedOutputs: z.array(reference).max(40),
    traceId: z.string().min(16).max(64),
  })
  .strict();
export const SandboxExecutionResultSchema = z
  .object({
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    assignmentId: uuid,
    taskId: uuid,
    provider: z.enum(["LOCAL_DOCKER", "E2B"]),
    status: z.enum(["COMPLETED", "FAILED"]),
    failureCode: z
      .enum([
        "CODE_ERROR",
        "TIMEOUT",
        "RESOURCE_LIMIT",
        "NETWORK_DENIED",
        "POLICY_DENIED",
        "DEPENDENCY_FAILURE",
        "SANDBOX_UNAVAILABLE",
      ])
      .nullable(),
    exitCode: z.number().int().nullable(),
    outputArtifactRefs: z.array(reference).max(40),
    stdoutSummary: z.string().max(4_000),
    stderrSummary: z.string().max(4_000),
    durationMs: z.number().int().nonnegative(),
    destroyed: z.literal(true),
    traceId: z.string().min(16).max(64),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DurableExecutionDashboardSchema = z
  .object({
    requests: z.array(CrossCompanyServiceRequestSchema).max(1_000),
    executions: z.array(DurableExecutionSchema).max(2_000),
    sandboxResults: z.array(SandboxExecutionResultSchema).max(1_000),
    histories: z.record(uuid, z.array(DurableExecutionEventSchema).max(10_000)),
    operationalWarnings: z
      .array(
        z
          .object({
            executionId: uuid.nullable(),
            serviceRequestId: uuid.nullable(),
            code: z.enum([
              "LEASE_STUCK",
              "WAITING_EXTERNAL_STALE",
              "APPROVAL_DEADLINE_EXCEEDED",
              "RETRY_EXHAUSTED",
            ]),
            message: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict();

export const CreateCrossCompanyPolicyRequestSchema =
  CrossCompanyCollaborationPolicySchema.pick({
    allowedDestinationCompanyIds: true,
    allowedServiceTypes: true,
    allowedSharingScopes: true,
    allowedCapabilities: true,
    maxBudgetCredits: true,
    approvalThresholdCredits: true,
    maxConcurrentServices: true,
  });
export const CreateCrossCompanyServiceRequestSchema = z
  .object({
    sourceCompanyId: CrossCompanyServiceRequestSchema.shape.sourceCompanyId,
    destinationCompanyId: CrossCompanyServiceRequestSchema.shape.destinationCompanyId,
    requesterAssignmentId: CrossCompanyServiceRequestSchema.shape.requesterAssignmentId,
    serviceType: CrossCompanyServiceRequestSchema.shape.serviceType,
    requestedOutcome: CrossCompanyServiceRequestSchema.shape.requestedOutcome,
    objectiveId: CrossCompanyServiceRequestSchema.shape.objectiveId,
    workflowId: CrossCompanyServiceRequestSchema.shape.workflowId,
    requestedCapabilities: CrossCompanyServiceRequestSchema.shape.requestedCapabilities,
    sharedInput: CrossCompanyServiceRequestSchema.shape.sharedInput,
    permittedOutputTypes: CrossCompanyServiceRequestSchema.shape.permittedOutputTypes,
    confidentiality: CrossCompanyServiceRequestSchema.shape.confidentiality,
    budgetCredits: CrossCompanyServiceRequestSchema.shape.budgetCredits,
    costAttribution: CrossCompanyServiceRequestSchema.shape.costAttribution,
    deadline: CrossCompanyServiceRequestSchema.shape.deadline,
    priority: CrossCompanyServiceRequestSchema.shape.priority,
  })
  .strict()
  .refine((value) => value.sourceCompanyId !== value.destinationCompanyId, {
    message:
      "Cross-company services require different source and destination companies.",
  });
export const CompleteCrossCompanyServiceRequestSchema = z
  .object({
    result: CrossCompanyServiceResultSchema,
    actualCostCredits: z.number().nonnegative(),
  })
  .strict();

export type CrossCompanyCollaborationPolicy = z.infer<
  typeof CrossCompanyCollaborationPolicySchema
>;
export type CrossCompanyServiceRequest = z.infer<
  typeof CrossCompanyServiceRequestSchema
>;
export type CrossCompanyServiceResult = z.infer<typeof CrossCompanyServiceResultSchema>;
export type CrossCompanyWorkforceResolution = z.infer<
  typeof CrossCompanyWorkforceResolutionSchema
>;
export type DurableExecution = z.infer<typeof DurableExecutionSchema>;
export type DurableFailureClass = z.infer<typeof DurableFailureClassSchema>;
export type DurableExecutionEvent = z.infer<typeof DurableExecutionEventSchema>;
export type DurableActivityReceipt = z.infer<typeof DurableActivityReceiptSchema>;
export type DurableExecutionDashboard = z.infer<typeof DurableExecutionDashboardSchema>;
export type SandboxExecutionRequest = z.infer<typeof SandboxExecutionRequestSchema>;
export type SandboxExecutionResult = z.infer<typeof SandboxExecutionResultSchema>;
