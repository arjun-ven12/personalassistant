import { z } from "zod";

import { AgentSessionRecordSchema } from "./agent-os.js";

export const ExternalResearchProjectSchema = z.enum([
  "gbrain",
  "hermes_agent",
  "everything_claude_code",
]);

export const ExternalHarvestClassificationSchema = z.enum([
  "COPY_DIRECTLY",
  "ADAPT_INTO_ALEXA",
  "USE_AS_REFERENCE",
  "ALREADY_HAVE",
  "REJECT",
]);

export const ExternalArtifactKindSchema = z.enum([
  "MEMORY_PATTERN",
  "AGENT",
  "SKILL",
  "WORKFLOW",
  "REVIEWER",
  "DEVELOPMENT_RULE",
  "SANDBOX_PATTERN",
  "IGNORED",
]);

export const ExternalArtifactProvenanceSchema = z
  .object({
    project: ExternalResearchProjectSchema,
    sourcePath: z.string().min(1).max(500),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    license: z.literal("MIT"),
    copyright: z.string().min(1).max(300),
    attributionRequired: z.literal(true),
  })
  .strict();

export const ExternalHarvestArtifactSchema = z
  .object({
    id: z.string().min(3).max(160),
    originalName: z.string().min(1).max(200),
    kind: ExternalArtifactKindSchema,
    classification: ExternalHarvestClassificationSchema,
    normalizedId: z.string().min(3).max(160).nullable(),
    rationale: z.string().min(1).max(1_000),
    authorityNotes: z.string().min(1).max(1_000),
    adaptationVersion: z.string().min(1).max(40),
    provenance: ExternalArtifactProvenanceSchema,
  })
  .strict();

export const ExternalProjectInventorySchema = z
  .object({
    project: ExternalResearchProjectSchema,
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    license: z.literal("MIT"),
    directCopyingPermitted: z.literal(true),
    attributionRequired: z.literal(true),
    inspectedArtifactCount: z.number().int().nonnegative(),
    externalRuntimeActive: z.literal(false),
  })
  .strict();

export const ExternalHarvestManifestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: z.iso.datetime(),
    projects: z.array(ExternalProjectInventorySchema).length(3),
    artifacts: z.array(ExternalHarvestArtifactSchema).max(200),
    everythingClaudeCodeInventory: z
      .object({
        agents: z.number().int().nonnegative(),
        skills: z.number().int().nonnegative(),
        commands: z.number().int().nonnegative(),
        workflows: z.number().int().nonnegative(),
        rules: z.number().int().nonnegative(),
        hooks: z.number().int().nonnegative(),
        normalizedAgents: z.number().int().nonnegative(),
        normalizedSkills: z.number().int().nonnegative(),
        normalizedWorkflows: z.number().int().nonnegative(),
        normalizedReviewers: z.number().int().nonnegative(),
        ignoredOrDuplicate: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const OrganizationalMemoryScopeSchema = z.enum([
  "SHARED",
  "EXECUTIVE",
  "ENGINEERING",
  "SALES",
  "MARKETING",
  "FINANCE",
  "OPERATIONS",
]);

export const KnowledgeGapRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    objective: z.string().trim().min(1).max(1_000),
    requiredFacts: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  })
  .strict();

export const BrainFirstLookupRequestSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    query: z.string().trim().min(1).max(1_000),
    minimumEvidence: z.number().int().min(1).max(10).default(1),
  })
  .strict();

export const BrainFirstLookupResponseSchema = z
  .object({
    agentId: z.string().min(3).max(120),
    query: z.string().min(1).max(1_000),
    permittedScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
    memoryIds: z.array(z.string().uuid()).max(20),
    sufficient: z.boolean(),
    externalRetrievalRecommended: z.boolean(),
    externalRetrievalStarted: z.literal(false),
    fabricatedFacts: z.literal(false),
  })
  .strict();

export const KnowledgeGapResponseSchema = z
  .object({
    objective: z.string().min(1).max(1_000),
    agentId: z.string().min(3).max(120),
    permittedScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
    known: z
      .array(
        z
          .object({
            fact: z.string().min(1).max(200),
            memoryIds: z.array(z.string().uuid()).max(10),
          })
          .strict(),
      )
      .max(30),
    missing: z.array(z.string().min(1).max(200)).max(30),
    fabricatedFacts: z.literal(false),
  })
  .strict();

export const PrepareDelegationRequestSchema = z
  .object({
    managerAgentId: z.string().min(3).max(120),
    specialistAgentId: z.string().min(3).max(120),
    task: z.string().trim().min(1).max(1_000),
    contextSummary: z.string().trim().min(1).max(2_000),
    requestedMemoryScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
    requestedCapabilities: z.array(z.string().min(3).max(120)).max(100),
    requestedSkills: z.array(z.string().min(3).max(120)).max(100),
    tokenBudget: z.number().int().min(1_000).max(100_000),
    costBudgetUsd: z.number().min(0).max(1_000),
    sandboxProfileId: z.literal("registered_validation_readonly"),
  })
  .strict();

export const PreparedDelegationSchema = z
  .object({
    delegationId: z.string().uuid(),
    ownerId: z.string().uuid(),
    managerAgentId: z.string().min(3).max(120),
    specialistAgentId: z.string().min(3).max(120),
    task: z.string().min(1).max(1_000),
    contextSummary: z.string().min(1).max(2_000),
    allowedMemoryScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
    allowedCapabilities: z.array(z.string().min(3).max(120)).max(100),
    allowedSkills: z.array(z.string().min(3).max(120)).max(100),
    rejectedRequests: z.array(z.string().min(1).max(200)).max(207),
    tokenBudget: z.number().int().min(1_000).max(100_000),
    costBudgetUsd: z.number().min(0).max(1_000),
    sandbox: z
      .object({
        id: z.literal("registered_validation_readonly"),
        hostShellAllowed: z.literal(false),
        arbitraryCommandsAllowed: z.literal(false),
        networkAccess: z.literal(false),
        writableHostFilesystem: z.literal(false),
      })
      .strict(),
    parentTranscriptIncluded: z.literal(false),
    directProviderAccess: z.literal(false),
    canApprove: z.literal(false),
    executionStarted: z.literal(false),
    resultContract: z
      .object({
        summaryRequired: z.literal(true),
        evidenceRefsRequired: z.literal(true),
        proposedActionsOnly: z.literal(true),
      })
      .strict(),
    preparedAt: z.iso.datetime(),
  })
  .strict();

export const ExecuteDelegationRequestSchema = PrepareDelegationRequestSchema.extend({
  developmentInput: z
    .object({
      sourceCode: z.string().min(1).max(20_000),
      testObjective: z.string().min(1).max(1_000),
    })
    .strict()
    .optional(),
}).strict();

export const SpecialistReasoningOutputSchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    findings: z.array(z.string().min(1).max(500)).max(30),
    proposedTest: z
      .object({
        filename: z.literal("generated.test.cjs"),
        content: z.string().min(1).max(20_000),
      })
      .strict()
      .nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const DelegatedSandboxResultSchema = z
  .object({
    providerId: z.literal("docker_node_test_v1"),
    status: z.enum(["PASSED", "FAILED", "UNAVAILABLE", "TIMED_OUT"]),
    exitCode: z.number().int().min(-1).max(255).nullable(),
    durationMs: z.number().int().nonnegative().max(60_000),
    stdout: z.string().max(16_000),
    stderr: z.string().max(16_000),
    network: z.literal("disabled"),
    hostWrites: z.literal(false),
    cleanedUp: z.boolean(),
  })
  .strict();

export const DelegationResultSchema = z
  .object({
    delegationId: z.string().uuid(),
    sessionId: z.string().uuid(),
    status: z.enum(["COMPLETE", "FAILED"]),
    summary: z.string().min(1).max(2_000),
    findings: z.array(z.string().min(1).max(500)).max(30),
    artifacts: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            kind: z.enum(["PROPOSED_TEST"]),
            content: z.string().min(1).max(20_000),
          })
          .strict(),
      )
      .max(10),
    tests: DelegatedSandboxResultSchema.nullable(),
    confidence: z.number().min(0).max(1),
    errors: z.array(z.string().min(1).max(500)).max(20),
    ai: z
      .object({
        requestId: z.string().uuid(),
        providerId: z.string().max(80),
        modelId: z.string().max(160),
        latencyMs: z.number().nonnegative(),
        routedThroughAIRouter: z.literal(true),
      })
      .strict(),
    context: z
      .object({
        parentTranscriptIncluded: z.literal(false),
        memoryScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
        memoryCount: z.number().int().nonnegative().max(100),
        capabilityRefs: z.array(z.string().min(3).max(120)).max(100),
        contextCharacters: z.number().int().nonnegative().max(40_000),
      })
      .strict(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
  })
  .strict();

export const BrainRuntimeSummarySchema = z
  .object({
    generatedAt: z.iso.datetime(),
    nodes: z
      .array(
        z
          .object({
            id: z.enum([
              "memory",
              "context",
              "agents",
              "skills",
              "workflows",
              "capabilities",
              "ai",
              "knowledge",
            ]),
            label: z.string().min(1).max(80),
            status: z.enum(["HEALTHY", "ACTIVE", "IDLE", "DEGRADED", "WARNING"]),
            value: z.string().min(1).max(120),
            detail: z.array(z.string().min(1).max(200)).max(8),
            active: z.boolean(),
          })
          .strict(),
      )
      .length(8),
    cognitivePath: z
      .array(
        z
          .object({
            stage: z.enum([
              "VOICE",
              "UNDERSTANDING",
              "MEMORY",
              "CONTEXT",
              "AI",
              "PLANNER",
              "CAPABILITY",
              "RESULT",
            ]),
            state: z.enum(["USED", "ACTIVE", "NOT_USED"]),
          })
          .strict(),
      )
      .length(8),
    cognition: z
      .object({
        intent: z.string().max(300),
        context: z.string().max(300),
        memory: z.string().max(120),
        ai: z.string().max(160),
        knowledgeConfidence: z.number().min(0).max(1).nullable(),
        missingInformation: z.number().int().nonnegative(),
      })
      .strict(),
    brainHealth: z
      .object({
        memory: z.enum(["HEALTHY", "DEGRADED"]),
        embeddings: z.number().min(0).max(1).nullable(),
        knowledgeGraph: z.enum(["HEALTHY", "DEGRADED"]),
        conflicts: z.number().int().nonnegative(),
        gaps: z.number().int().nonnegative(),
        orphans: z.number().int().nonnegative(),
      })
      .strict(),
    knowledgeNeighborhood: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            label: z.string().min(1).max(255),
            kind: z.string().min(1).max(80),
            connectionCount: z.number().int().nonnegative(),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(24),
    organization: z
      .array(
        z
          .object({
            id: z.string().min(3).max(120),
            label: z.string().min(1).max(120),
            parentId: z.string().min(3).max(120).nullable(),
            kind: z.enum(["MANAGER", "SPECIALIST", "REVIEWER"]),
            status: z.string().min(1).max(40),
            memoryScopes: z.array(OrganizationalMemoryScopeSchema).max(7),
            capabilityCount: z.number().int().nonnegative(),
            provenanceProject: ExternalResearchProjectSchema.nullable(),
          })
          .strict(),
      )
      .max(100),
    delegations: z.array(AgentSessionRecordSchema).max(20),
    knowledgeGaps: z
      .array(
        z
          .object({
            objective: z.string().min(1).max(1_000),
            knownCount: z.number().int().nonnegative(),
            missing: z.array(z.string().min(1).max(200)).max(30),
            assessedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(20),
    observability: z
      .object({
        brainFirstLookups: z.number().int().nonnegative(),
        memorySufficient: z.number().int().nonnegative(),
        aiRequired: z.number().int().nonnegative(),
        deterministicResolutions: z.number().int().nonnegative(),
        memoryFirstAverageLatencyMs: z.number().nonnegative().nullable(),
        aiAverageLatencyMs: z.number().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export const ExternalHarvestDashboardSchema = z
  .object({
    manifest: ExternalHarvestManifestSchema,
    developmentDepartment: z
      .object({
        agents: z.array(z.string().min(3).max(120)).max(30),
        reviewers: z.array(z.string().min(3).max(120)).max(30),
        workflow: z.literal("development_review_loop_v1"),
      })
      .strict(),
    authority: z
      .object({
        alexaGovernanceAuthoritative: z.literal(true),
        aiRouterRequired: z.literal(true),
        alexaMemoryRequired: z.literal(true),
        capabilityGovernanceRequired: z.literal(true),
        externalRuntimesActive: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ExternalHarvestManifest = z.infer<typeof ExternalHarvestManifestSchema>;
export type OrganizationalMemoryScope = z.infer<typeof OrganizationalMemoryScopeSchema>;
export type PrepareDelegationRequest = z.infer<typeof PrepareDelegationRequestSchema>;
export type ExecuteDelegationRequest = z.infer<typeof ExecuteDelegationRequestSchema>;
export type DelegationResult = z.infer<typeof DelegationResultSchema>;
export type BrainRuntimeSummary = z.infer<typeof BrainRuntimeSummarySchema>;
