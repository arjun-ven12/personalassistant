import { z } from "zod";
import {
  AIContextBlockSchema,
  AIOutputModeSchema,
  AIPrivacyRequirementSchema,
  AITraceContextSchema,
} from "./ai.js";

export const CognitiveContextSourceTypeSchema = z.enum([
  "SYSTEM_POLICY",
  "PERSONALITY",
  "OWNER_PROFILE",
  "LEARNED_PREFERENCE",
  "KNOWLEDGE_GRAPH",
  "MEMORY",
  "CONVERSATION",
  "RECENT_ACTIVITY",
  "PROJECT",
  "WORKFLOW",
  "AGENT",
  "TOOL_RESULT",
  "SEMANTIC_WORKSPACE",
  "DOCUMENT",
  "APPLICATION_STATE",
  "EXTERNAL_CONTENT",
]);
export const CognitiveTrustLevelSchema = z.enum([
  "SYSTEM",
  "TRUSTED",
  "USER_AUTHORED",
  "DERIVED",
  "UNTRUSTED_EXTERNAL",
]);
export const CognitiveSensitivitySchema = z.enum([
  "NORMAL",
  "PRIVATE",
  "RESTRICTED",
  "SECRET",
]);
export const CognitiveContextProfileSchema = z.enum([
  "VOICE_INTERPRETATION",
  "GENERAL_CONVERSATION",
  "CODING",
  "BUSINESS_ANALYSIS",
  "WRITING",
  "RESEARCH",
  "AGENT_TASK",
  "WORKFLOW_STEP",
  "PLANNING",
  "SUMMARIZATION",
  "CUSTOM",
]);
export const CognitiveContextProfileOriginSchema = z.enum([
  "SYSTEM_PROFILE",
  "OWNER_OVERRIDE",
]);
export const CognitiveCacheabilitySchema = z.enum([
  "STATIC",
  "SESSION",
  "DYNAMIC",
  "NEVER",
]);
export const CognitiveOmissionReasonSchema = z.enum([
  "LOW_RELEVANCE",
  "TOKEN_BUDGET",
  "DUPLICATE",
  "STALE",
  "PRIVACY_RESTRICTED",
  "SCOPE_MISMATCH",
  "CONFLICT",
  "SOURCE_EXCLUDED",
  "SOURCE_FAILED",
  "ACCESS_DENIED",
]);
export const CognitiveConflictResolutionSchema = z.enum([
  "RESOLVED_BY_AUTHORITY",
  "RESOLVED_BY_FRESHNESS",
  "UNRESOLVED",
  "CLARIFICATION_REQUIRED",
]);
export const CognitiveSufficiencyRecommendationSchema = z.enum([
  "PROCEED",
  "CLARIFY",
  "RETRIEVE_MORE",
  "FAIL",
]);
export const CognitiveSourceCriticalitySchema = z.enum([
  "REQUIRED",
  "IMPORTANT",
  "OPTIONAL",
]);
export const CognitiveSourceStatusSchema = z.enum(["SUCCESS", "DEGRADED", "FAILED"]);
export const CognitiveStalenessSchema = z.enum(["FRESH", "AGING", "STALE", "UNKNOWN"]);
export const CognitiveProviderTrustSchema = z.enum([
  "TRUSTED_LOCAL",
  "APPROVED_CLOUD",
  "UNTRUSTED",
]);

export const CognitiveContextScopeSchema = z
  .object({
    projectId: z.string().max(255).optional(),
    workflowId: z.string().max(255).optional(),
    workflowRunId: z.string().max(255).optional(),
    taskId: z.string().max(255).optional(),
    agentId: z.string().max(255).optional(),
    conversationId: z.string().max(255).optional(),
    applicationId: z.string().max(255).optional(),
    workspaceId: z.string().max(255).optional(),
  })
  .strict();

export const CognitiveSourceReferenceSchema = z
  .object({
    sourceType: CognitiveContextSourceTypeSchema,
    sourceId: z.string().max(240),
    version: z.string().max(120).optional(),
  })
  .strict();
export const CognitiveContextScoreSchema = z
  .object({
    semantic: z.number().min(0).max(1),
    entity: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    importance: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    sourcePriority: z.number().min(0).max(1),
    sourceAuthority: z.number().min(0).max(1),
    scopeMatch: z.number().min(0).max(1),
    taskAssociation: z.number().min(0).max(1),
    total: z.number().min(0).max(1),
  })
  .strict();
export const CognitiveContextBlockSchema = z
  .object({
    id: z.string().min(1).max(240),
    sourceType: CognitiveContextSourceTypeSchema,
    trustLevel: CognitiveTrustLevelSchema,
    title: z.string().max(240).optional(),
    content: z.json(),
    relevanceScore: z.number().min(0).max(1),
    importanceScore: z.number().min(0).max(1),
    recencyScore: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    estimatedTokens: z.number().int().nonnegative(),
    entityIds: z.array(z.string().max(160)).max(50).optional(),
    sourceReferences: z.array(CognitiveSourceReferenceSchema).max(20).optional(),
    scope: CognitiveContextScopeSchema.optional(),
    authorityScore: z.number().min(0).max(1).optional(),
    staleness: CognitiveStalenessSchema.optional(),
    observedAt: z.iso.datetime().optional(),
    validFrom: z.iso.datetime().optional(),
    validUntil: z.iso.datetime().optional(),
    cacheability: CognitiveCacheabilitySchema.optional(),
    sensitivity: CognitiveSensitivitySchema.default("NORMAL"),
    metadata: z.record(z.string(), z.json()).optional(),
    score: CognitiveContextScoreSchema.optional(),
    mandatory: z.boolean().default(false),
  })
  .strict();
export const CognitiveContextCandidateSchema = CognitiveContextBlockSchema.extend({
  canonicalKey: z.string().max(240).optional(),
}).strict();
export const CognitiveContextConflictSchema = z
  .object({
    conflictId: z.string().min(1).max(240),
    subject: z.string().max(240),
    candidateFacts: z
      .array(
        z
          .object({
            blockId: z.string().max(240),
            summary: z.string().max(500),
            confidence: z.number().min(0).max(1).optional(),
          })
          .strict(),
      )
      .max(20),
    resolution: CognitiveConflictResolutionSchema,
    selectedFactId: z.string().max(240).optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();
export const CognitiveContextOmissionSchema = z
  .object({
    blockId: z.string().max(240),
    reason: CognitiveOmissionReasonSchema,
    detail: z.string().max(300).optional(),
  })
  .strict();
export const CognitiveContextTraceSchema = z
  .object({
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    contextId: z.string().uuid(),
    candidatesRetrieved: z.number().int().nonnegative(),
    candidatesIncluded: z.number().int().nonnegative(),
    candidatesOmitted: z.number().int().nonnegative(),
    tokensBeforeCompression: z.number().int().nonnegative(),
    tokensAfterCompression: z.number().int().nonnegative(),
    sourceBreakdown: z.record(z.string(), z.number().int().nonnegative()),
    sourceStatuses: z.record(z.string(), CognitiveSourceStatusSchema),
    sourceLatencyMs: z.record(z.string(), z.number().nonnegative()),
    selectionReasons: z.array(z.string().max(300)).max(50),
    omissions: z.array(CognitiveContextOmissionSchema).max(100),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const AIOutputContractSchema = z
  .object({
    mode: AIOutputModeSchema,
    schemaName: z.string().max(160).optional(),
    schema: z.json().optional(),
    maxOutputTokens: z.number().int().positive().max(32_768).optional(),
    constraints: z.array(z.string().max(300)).max(20).optional(),
  })
  .strict();
export const AIContextCachePlanSchema = z
  .object({
    staticPrefixBlocks: z.array(z.string().max(240)).max(50),
    sessionBlocks: z.array(z.string().max(240)).max(50),
    dynamicBlocks: z.array(z.string().max(240)).max(50),
    estimatedCacheableTokens: z.number().int().nonnegative(),
  })
  .strict();
export const CognitiveContextInstructionSchema = z
  .object({
    id: z.string().max(160),
    text: z.string().min(1).max(2_000),
    trustLevel: CognitiveTrustLevelSchema,
    cacheability: CognitiveCacheabilitySchema,
  })
  .strict();
export const CognitiveContextRequestSchema = z
  .object({
    ownerId: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    purpose: z.string().min(1).max(40),
    taskText: z.string().max(16_000).optional(),
    conversationId: z.string().uuid().optional(),
    sessionId: z.string().max(160).optional(),
    agentId: z.string().min(3).max(120).optional(),
    workflowId: z.string().uuid().optional(),
    workflowRunId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    entityIds: z.array(z.string().max(160)).max(50).optional(),
    requestedProfile: CognitiveContextProfileSchema.default("GENERAL_CONVERSATION"),
    modelContextWindow: z.number().int().positive().optional(),
    maxContextTokens: z.number().int().positive().max(128_000).optional(),
    economicMaxInputTokens: z.number().int().positive().max(128_000).optional(),
    maxOutputTokens: z.number().int().nonnegative().max(32_768).optional(),
    reasoningReserveTokens: z.number().int().nonnegative().max(32_768).optional(),
    providerOverheadTokens: z.number().int().nonnegative().max(8_192).optional(),
    safetyMarginTokens: z.number().int().nonnegative().max(8_192).optional(),
    providerId: z.string().max(80).optional(),
    modelId: z.string().max(160).optional(),
    locality: z.enum(["LOCAL", "REMOTE"]).optional(),
    providerTrust: CognitiveProviderTrustSchema.optional(),
    includeSources: z.array(CognitiveContextSourceTypeSchema).max(30).optional(),
    excludeSources: z.array(CognitiveContextSourceTypeSchema).max(30).optional(),
    risk: z.string().max(40).optional(),
    privacy: AIPrivacyRequirementSchema.default("STANDARD"),
    inputContext: z.array(AIContextBlockSchema).max(40).optional(),
    trace: AITraceContextSchema.optional(),
  })
  .strict();
export const CognitiveContextPackageSchema = z
  .object({
    contextId: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    profile: CognitiveContextProfileSchema,
    profileVersion: z.string().max(80),
    profileOrigin: CognitiveContextProfileOriginSchema,
    providerBoundary: z
      .object({
        providerId: z.string().max(80).optional(),
        modelId: z.string().max(160).optional(),
        locality: z.enum(["LOCAL", "REMOTE"]).optional(),
        trust: CognitiveProviderTrustSchema,
      })
      .strict(),
    instructions: z.array(CognitiveContextInstructionSchema).max(30),
    blocks: z.array(CognitiveContextBlockSchema).max(100),
    outputContract: AIOutputContractSchema.optional(),
    estimatedTokens: z.number().int().nonnegative(),
    maxAllowedTokens: z.number().int().positive(),
    omittedCandidates: z.array(CognitiveContextOmissionSchema).max(100),
    conflicts: z.array(CognitiveContextConflictSchema).max(30),
    provenance: z.array(CognitiveSourceReferenceSchema).max(200),
    cachePlan: AIContextCachePlanSchema.optional(),
    compositionTrace: CognitiveContextTraceSchema,
    sufficiency: z
      .object({
        sufficient: z.boolean(),
        confidence: z.number().min(0).max(1),
        missingRequiredContext: z.array(z.string().max(160)).max(20),
        recommendation: CognitiveSufficiencyRecommendationSchema,
      })
      .strict(),
  })
  .strict();
export const AIPromptPlanSchema = z
  .object({
    version: z.string().max(80),
    contextId: z.string().uuid().optional(),
    systemInstructions: z.array(CognitiveContextInstructionSchema).max(30),
    userTask: z.string().max(16_000),
    contextSections: z
      .array(
        z
          .object({
            id: z.string().max(240),
            sourceType: CognitiveContextSourceTypeSchema,
            trustLevel: CognitiveTrustLevelSchema,
            content: z.json(),
            cacheability: CognitiveCacheabilitySchema,
          })
          .strict(),
      )
      .max(100),
    outputContract: AIOutputContractSchema.optional(),
    trustBoundaries: z.array(z.string().max(300)).max(30),
    cachePlan: AIContextCachePlanSchema.optional(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CognitiveContextSourceType = z.infer<
  typeof CognitiveContextSourceTypeSchema
>;
export type CognitiveContextProfile = z.infer<typeof CognitiveContextProfileSchema>;
export type CognitiveContextRequest = z.input<typeof CognitiveContextRequestSchema>;
export type CognitiveContextCandidate = z.infer<typeof CognitiveContextCandidateSchema>;
export type CognitiveContextBlock = z.infer<typeof CognitiveContextBlockSchema>;
export type CognitiveContextPackage = z.infer<typeof CognitiveContextPackageSchema>;
export type AIPromptPlan = z.infer<typeof AIPromptPlanSchema>;
export type AIOutputContract = z.infer<typeof AIOutputContractSchema>;
export type AIContextCachePlan = z.infer<typeof AIContextCachePlanSchema>;
export type CognitiveContextScore = z.infer<typeof CognitiveContextScoreSchema>;
export type CognitiveContextConflict = z.infer<typeof CognitiveContextConflictSchema>;
export type CognitiveContextOmission = z.infer<typeof CognitiveContextOmissionSchema>;
