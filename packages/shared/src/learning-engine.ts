import { z } from "zod";

export const LearningCategorySchema = z.enum([
  "VOCABULARY",
  "ALIAS",
  "PREFERRED_APPLICATION",
  "PREFERRED_WORKFLOW",
  "PREFERRED_AGENT",
  "PREFERRED_PROJECT",
  "COMMUNICATION_STYLE",
  "RESPONSE_LENGTH",
  "CONFIRMATION_STYLE",
  "TERMINOLOGY",
  "WORKING_STYLE",
  "TIME_PATTERN",
  "SEQUENCE_PATTERN",
  "TASK_ROUTINE",
  "NAVIGATION_PATTERN",
  "PROJECT_ASSOCIATION",
  "ENTITY_ASSOCIATION",
  "DECISION_PATTERN",
  "TOOL_PREFERENCE",
  "MODEL_PREFERENCE",
  "LOCAL_VS_CLOUD_PREFERENCE",
  "RETRY_BEHAVIOUR",
  "CLARIFICATION_PATTERN",
  "ERROR_RECOVERY_PATTERN",
  "WRITING_STYLE",
  "BUSINESS_PROCESS_PATTERN",
  "NOTIFICATION_PREFERENCE",
  "FOCUS_PATTERN",
]);

export const LearningSourceTypeSchema = z.enum([
  "human_understanding",
  "clarification",
  "correction",
  "workflow",
  "application",
  "project",
  "agent",
  "personality",
  "response_feedback",
  "knowledge_graph",
  "manual_teaching",
  "voice",
  "gesture",
  "dashboard",
  "api",
]);

export const LearningCandidateStatusSchema = z.enum([
  "OBSERVING",
  "CANDIDATE",
  "SUGGESTED",
  "APPROVED",
  "ACTIVE",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
]);

export const LearnedPreferenceStatusSchema = z.enum([
  "ACTIVE",
  "LOCKED",
  "SUPERSEDED",
  "REVOKED",
  "EXPIRED",
]);

export const LearningSecuritySensitivitySchema = z.enum([
  "low",
  "medium",
  "high",
  "prohibited",
]);

export const LearningScopeSchema = z
  .object({
    level: z.enum([
      "GLOBAL",
      "PROJECT",
      "APPLICATION",
      "WORKFLOW",
      "PROFILE",
      "TIME_OF_DAY",
      "LOCATION_CLASS",
      "VOICE",
      "TEXT",
      "BUSINESS",
      "DEVELOPMENT",
    ]),
    projectId: z.string().min(1).max(255).nullable(),
    applicationId: z.string().min(1).max(255).nullable(),
    workflowId: z.string().min(1).max(255).nullable(),
    agentId: z.string().min(1).max(255).nullable(),
    profileId: z.string().min(1).max(255).nullable(),
    modality: z.enum(["voice", "text", "gesture", "dashboard", "api"]).nullable(),
    timeBucket: z.enum(["morning", "afternoon", "evening", "night"]).nullable(),
    weekdayBucket: z.enum(["weekday", "weekend"]).nullable(),
  })
  .strict();

export const LearningCategoryPolicySchema = z
  .object({
    category: LearningCategorySchema,
    observationThreshold: z.number().int().min(1).max(100),
    candidateThreshold: z.number().int().min(1).max(100),
    suggestionThreshold: z.number().int().min(1).max(500),
    suggestionConfidence: z.number().min(0).max(1),
    autoApplyThreshold: z.number().int().min(1).max(2_000),
    autoApplyConfidence: z.number().min(0).max(1),
    decayRate: z.number().min(0).max(1),
    autoApplyAllowed: z.boolean(),
    ownerConfirmationRequired: z.boolean(),
    securitySensitivity: LearningSecuritySensitivitySchema,
    reversible: z.boolean(),
  })
  .strict();

export const LearningEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    eventType: z.string().min(1).max(120),
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    context: LearningScopeSchema,
    observedValue: z.string().min(1).max(500),
    expectedValue: z.string().min(1).max(500).nullable(),
    sourceType: LearningSourceTypeSchema,
    sourceId: z.string().min(1).max(255).nullable(),
    positiveEvidence: z.number().int().min(0).max(100),
    negativeEvidence: z.number().int().min(0).max(100),
    confidenceContribution: z.number().min(-1).max(1),
    timestamp: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown()),
    correlationId: z.string().min(1).max(255).nullable(),
    sessionId: z.string().min(1).max(255).nullable(),
    projectId: z.string().min(1).max(255).nullable(),
    workflowId: z.string().min(1).max(255).nullable(),
    agentId: z.string().min(1).max(255).nullable(),
    applicationId: z.string().min(1).max(255).nullable(),
    persisted: z.literal(true),
  })
  .strict();

export const LearningCandidateSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    candidateValue: z.string().min(1).max(500),
    context: LearningScopeSchema,
    confidence: z.number().min(0).max(1),
    evidenceCount: z.number().int().nonnegative(),
    positiveEvidence: z.number().int().nonnegative(),
    negativeEvidence: z.number().int().nonnegative(),
    sourceDiversity: z.number().int().nonnegative(),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    decayRate: z.number().min(0).max(1),
    status: LearningCandidateStatusSchema,
    autoApplicable: z.boolean(),
    requiresApproval: z.boolean(),
    manualOverride: z.boolean(),
    explanation: z.string().min(1).max(2_000),
    supportingEvidence: z.array(z.string().uuid()).max(200),
    lastSuggestedAt: z.iso.datetime().nullable(),
    rejectionCount: z.number().int().nonnegative(),
    nextEligibleAt: z.iso.datetime().nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const LearnedPreferenceSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    value: z.string().min(1).max(500),
    context: LearningScopeSchema,
    confidence: z.number().min(0).max(1),
    sourceCandidateId: z.string().uuid().nullable(),
    effectiveFrom: z.iso.datetime(),
    effectiveUntil: z.iso.datetime().nullable(),
    locked: z.boolean(),
    manualOverride: z.boolean(),
    status: LearnedPreferenceStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    version: z.number().int().positive(),
    explanation: z.string().min(1).max(2_000),
  })
  .strict();

export const SequencePatternSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    orderedActions: z.array(z.string().min(1).max(160)).min(2).max(8),
    context: LearningScopeSchema,
    frequency: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    averageIntervalSeconds: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    firstSeenAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    relatedProject: z.string().min(1).max(255).nullable(),
    relatedWorkflow: z.string().min(1).max(255).nullable(),
    candidateId: z.string().uuid().nullable(),
  })
  .strict();

export const HabitPatternSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    category: LearningCategorySchema,
    name: z.string().min(1).max(200),
    subject: z.string().min(1).max(240),
    value: z.string().min(1).max(500),
    context: LearningScopeSchema,
    frequency: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    firstSeenAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    suggestedAction: z.string().min(1).max(500).nullable(),
    candidateId: z.string().uuid().nullable(),
  })
  .strict();

export const LearningSuggestionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    candidateId: z.string().uuid(),
    suggestionType: z.enum([
      "approve_preference",
      "create_alias",
      "create_workflow",
      "adjust_style",
      "prefer_application",
      "prefer_agent",
    ]),
    title: z.string().min(1).max(255),
    message: z.string().min(1).max(1_000),
    status: z.enum(["pending", "accepted", "rejected", "expired"]),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastShownAt: z.iso.datetime().nullable(),
    rejectionCount: z.number().int().nonnegative(),
    nextEligibleAt: z.iso.datetime().nullable(),
  })
  .strict();

export const LearningConflictSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    candidateIds: z.array(z.string().uuid()).min(2).max(10),
    reason: z.string().min(1).max(1_000),
    status: z.enum(["open", "observing", "resolved", "dismissed"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const LearningTimelineEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    eventType: z.string().min(1).max(120),
    subject: z.string().min(1).max(240),
    summary: z.string().min(1).max(1_000),
    candidateId: z.string().uuid().nullable(),
    preferenceId: z.string().uuid().nullable(),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const LearningStatsSchema = z
  .object({
    eventsProcessed: z.number().int().nonnegative(),
    candidatesActive: z.number().int().nonnegative(),
    preferencesActive: z.number().int().nonnegative(),
    suggestionsPending: z.number().int().nonnegative(),
    suggestionAcceptanceRate: z.number().min(0).max(1),
    suggestionRejectionRate: z.number().min(0).max(1),
    correctionRate: z.number().min(0).max(1),
    averageConfidence: z.number().min(0).max(1),
    expiredCandidates: z.number().int().nonnegative(),
    habitsDetected: z.number().int().nonnegative(),
    sequencePatternsDetected: z.number().int().nonnegative(),
  })
  .strict();

export const LearningDashboardResponseSchema = z
  .object({
    categories: z.array(LearningCategoryPolicySchema).max(100),
    events: z.array(LearningEventSchema).max(500),
    candidates: z.array(LearningCandidateSchema).max(500),
    preferences: z.array(LearnedPreferenceSchema).max(500),
    sequences: z.array(SequencePatternSchema).max(200),
    habits: z.array(HabitPatternSchema).max(200),
    suggestions: z.array(LearningSuggestionSchema).max(200),
    conflicts: z.array(LearningConflictSchema).max(200),
    timeline: z.array(LearningTimelineEventSchema).max(500),
    stats: LearningStatsSchema,
    automaticSecurityMutationEnabled: z.literal(false),
    llmRequired: z.literal(false),
  })
  .strict();

export const CreateLearningEventRequestSchema = z
  .object({
    eventType: z.string().min(1).max(120),
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    context: LearningScopeSchema.partial().optional(),
    observedValue: z.string().min(1).max(500),
    expectedValue: z.string().min(1).max(500).nullable().optional(),
    sourceType: LearningSourceTypeSchema,
    sourceId: z.string().min(1).max(255).nullable().optional(),
    positiveEvidence: z.number().int().min(0).max(100).optional(),
    negativeEvidence: z.number().int().min(0).max(100).optional(),
    confidenceContribution: z.number().min(-1).max(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    correlationId: z.string().min(1).max(255).nullable().optional(),
    sessionId: z.string().min(1).max(255).nullable().optional(),
    projectId: z.string().min(1).max(255).nullable().optional(),
    workflowId: z.string().min(1).max(255).nullable().optional(),
    agentId: z.string().min(1).max(255).nullable().optional(),
    applicationId: z.string().min(1).max(255).nullable().optional(),
    privateMode: z.boolean().optional(),
    doNotLearn: z.boolean().optional(),
  })
  .strict();

export const TeachPreferenceRequestSchema = z
  .object({
    category: LearningCategorySchema,
    subject: z.string().min(1).max(240),
    value: z.string().min(1).max(500),
    context: LearningScopeSchema.partial().optional(),
    locked: z.boolean().optional(),
    explanation: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export const SequenceObservationRequestSchema = z
  .object({
    actions: z.array(z.string().min(1).max(160)).min(2).max(12),
    context: LearningScopeSchema.partial().optional(),
    relatedProject: z.string().min(1).max(255).nullable().optional(),
    relatedWorkflow: z.string().min(1).max(255).nullable().optional(),
    success: z.boolean().optional(),
    timestamps: z.array(z.iso.datetime()).max(12).optional(),
    privateMode: z.boolean().optional(),
    doNotLearn: z.boolean().optional(),
  })
  .strict();

export const LearningExplainResponseSchema = z
  .object({
    learnedItem: LearnedPreferenceSchema.nullable(),
    candidate: LearningCandidateSchema.nullable(),
    suggestion: LearningSuggestionSchema.nullable(),
    evidence: z.array(LearningEventSchema).max(200),
    explanation: z.string().min(1).max(2_000),
    reversible: z.boolean(),
  })
  .strict();

export type LearningCategory = z.infer<typeof LearningCategorySchema>;
export type LearningScope = z.infer<typeof LearningScopeSchema>;
export type LearningCategoryPolicy = z.infer<typeof LearningCategoryPolicySchema>;
export type LearningEvent = z.infer<typeof LearningEventSchema>;
export type LearningCandidate = z.infer<typeof LearningCandidateSchema>;
export type LearnedPreference = z.infer<typeof LearnedPreferenceSchema>;
export type SequencePattern = z.infer<typeof SequencePatternSchema>;
export type HabitPattern = z.infer<typeof HabitPatternSchema>;
export type LearningSuggestion = z.infer<typeof LearningSuggestionSchema>;
export type LearningConflict = z.infer<typeof LearningConflictSchema>;
export type LearningTimelineEvent = z.infer<typeof LearningTimelineEventSchema>;
export type LearningStats = z.infer<typeof LearningStatsSchema>;
export type CreateLearningEventRequest = z.infer<
  typeof CreateLearningEventRequestSchema
>;
export type TeachPreferenceRequest = z.infer<typeof TeachPreferenceRequestSchema>;
export type SequenceObservationRequest = z.infer<
  typeof SequenceObservationRequestSchema
>;
