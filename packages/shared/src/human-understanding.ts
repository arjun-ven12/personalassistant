import { z } from "zod";

import { MemoryRecordSchema } from "./memory.js";
import { CorpusDashboardResponseSchema, CorpusEntrySchema } from "./personality-corpus.js";

export const HumanUnderstandingSourceSchema = z.enum([
  "voice",
  "text",
  "gesture",
  "dashboard",
  "planner",
  "agent",
  "api",
]);

export const HumanConversationStateSchema = z.enum([
  "IDLE",
  "LISTENING",
  "UNDERSTANDING",
  "CLARIFYING",
  "PLANNING",
  "EXECUTING",
  "WAITING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "ERROR",
]);

export const PersonalityInteractionStateSchema = z.enum([
  "neutral",
  "encouraging",
  "celebrating",
  "focused",
  "serious",
  "busy",
  "waiting",
  "explaining",
  "learning",
]);

export const PersonalityProfileSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    identity: z.string().min(1).max(500),
    speechStyle: z.string().min(1).max(500),
    communicationStyle: z.string().min(1).max(500),
    workingStyle: z.string().min(1).max(500),
    decisionStyle: z.string().min(1).max(500),
    socialRules: z.array(z.string().min(1).max(300)).max(50),
    interactionPolicies: z.array(z.string().min(1).max(300)).max(50),
    active: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityStateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    state: PersonalityInteractionStateSchema,
    reason: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const RuntimeBehaviourStateSchema = z.enum([
  "idle",
  "focused",
  "coding",
  "researching",
  "debugging",
  "building",
  "meeting",
  "presenting",
  "learning",
  "relaxed",
  "busy",
]);

export const PersonalityIdentityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    assistantName: z.string().min(1).max(80),
    ownerName: z.string().min(1).max(120),
    relationship: z.string().min(1).max(160),
    role: z.string().min(1).max(160),
    mission: z.string().min(1).max(800),
    version: z.number().int().positive(),
    identityDescription: z.string().min(1).max(1_000),
    longTermGoals: z.array(z.string().min(1).max(300)).max(20),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityTraitRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    key: z.string().min(1).max(120),
    label: z.string().min(1).max(160),
    value: z.number().int().min(0).max(100),
    description: z.string().min(1).max(800),
    source: z.enum(["system", "manual", "learned"]),
    confidence: z.number().min(0).max(1),
    version: z.number().int().positive(),
    active: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityBehaviourRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    behaviourKey: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
    state: RuntimeBehaviourStateSchema,
    trigger: z.string().min(1).max(240),
    action: z.string().min(1).max(240),
    deterministic: z.literal(true),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommunicationRuleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    ruleKey: z.string().min(1).max(120),
    category: z.enum([
      "greeting",
      "acknowledgement",
      "confirmation",
      "error",
      "success",
      "thinking",
      "explanation",
      "pacing",
    ]),
    preference: z.string().min(1).max(500),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionPolicyRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    policyKey: z.string().min(1).max(140),
    description: z.string().min(1).max(800),
    enforcement: z.enum(["allow", "warn", "confirm", "deny", "silence"]),
    priority: z.number().int().min(0).max(100),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DecisionPreferenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    preferenceKey: z.string().min(1).max(140),
    label: z.string().min(1).max(160),
    value: z.enum(["strongly_prefer", "prefer", "neutral", "avoid", "block"]),
    explanation: z.string().min(1).max(800),
    confidence: z.number().min(0).max(1),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkingStyleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    styleKey: z.string().min(1).max(140),
    label: z.string().min(1).max(160),
    enabled: z.boolean(),
    confidence: z.number().min(0).max(1),
    source: z.enum(["system", "manual", "learned"]),
    explanation: z.string().min(1).max(800),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const BehaviourExampleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    situation: z.string().min(1).max(240),
    userText: z.string().min(1).max(500),
    assistantText: z.string().min(1).max(1_000),
    confidence: z.number().min(0).max(1),
    source: z.enum(["system", "manual", "learned"]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityLearningEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    observedBehaviour: z.string().min(1).max(500),
    evidenceCount: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    firstSeenAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    decayRate: z.number().min(0).max(1),
    manualOverride: z.boolean(),
    reason: z.string().min(1).max(1_000),
    proposedChange: z.string().min(1).max(500).nullable(),
    applied: z.boolean(),
  })
  .strict();

export const PreferenceConfidenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    preferenceKey: z.string().min(1).max(140),
    currentValue: z.string().min(1).max(300),
    proposedValue: z.string().min(1).max(300).nullable(),
    evidenceCount: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    explanation: z.string().min(1).max(1_000),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PersonalitySimulationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    input: z.string().min(1).max(1_000),
    profileName: z.string().min(1).max(120),
    responsePreview: z.string().min(1).max(1_000),
    traitsApplied: z.array(z.string().min(1).max(160)).max(30),
    aiUsed: z.literal(false),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityStateHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    previousState: RuntimeBehaviourStateSchema.nullable(),
    state: RuntimeBehaviourStateSchema,
    reason: z.string().min(1).max(800),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ResponseExplanationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    response: z.string().min(1).max(2_000),
    influencedBy: z.array(z.string().min(1).max(240)).max(40),
    aiUsed: z.boolean(),
    plannerConfidence: z.number().min(0).max(1).nullable(),
    profileName: z.string().min(1).max(120),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const HumanVocabularyKindSchema = z.enum([
  "known_word",
  "custom_word",
  "owner_vocabulary",
  "technical_vocabulary",
  "application_name",
  "project_name",
  "company_name",
  "nickname",
  "abbreviation",
  "common_phrase",
]);

export const VocabularyEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    term: z.string().trim().min(1).max(160),
    normalizedTerm: z.string().trim().min(1).max(160),
    kind: HumanVocabularyKindSchema,
    confidence: z.number().min(0).max(1),
    version: z.number().int().positive(),
    source: z.enum(["system", "manual", "learned", "adapter", "memory"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AliasDictionaryEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    phrase: z.string().trim().min(1).max(160),
    normalizedPhrase: z.string().trim().min(1).max(160),
    canonical: z.string().trim().min(1).max(160),
    targetType: z.enum(["intent", "entity", "capability", "workflow", "application"]),
    confidence: z.number().min(0).max(1),
    evidenceCount: z.number().int().nonnegative(),
    source: z.enum(["system", "manual", "learned"]),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const HumanSynonymEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    term: z.string().trim().min(1).max(160),
    normalizedTerm: z.string().trim().min(1).max(160),
    synonyms: z.array(z.string().trim().min(1).max(160)).max(50),
    canonical: z.string().trim().min(1).max(160),
    confidence: z.number().min(0).max(1),
    source: z.enum(["system", "manual", "learned"]),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PatternLibraryEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    pattern: z.string().trim().min(1).max(300),
    intentId: z.string().trim().min(1).max(160),
    entitySlots: z.array(z.string().trim().min(1).max(80)).max(20),
    confidence: z.number().min(0).max(1),
    priority: z.number().int().min(0).max(100),
    active: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const BehaviourRuleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    trigger: z.string().trim().min(1).max(160),
    normalizedTrigger: z.string().trim().min(1).max(160),
    responseAction: z.enum([
      "greeting_response",
      "farewell_response",
      "stop_listening",
      "cancel_workflow",
      "repeat_previous_response",
      "acknowledgement",
      "help_response",
      "none",
    ]),
    responseTemplate: z.string().trim().min(1).max(800),
    confidence: z.number().min(0).max(1),
    active: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationStateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    previousState: HumanConversationStateSchema.nullable(),
    state: HumanConversationStateSchema,
    reason: z.string().min(1).max(500),
    deterministic: z.literal(true),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const UnderstandingStageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    stage: z.string().min(1).max(80),
    input: z.json(),
    output: z.json(),
    confidence: z.number().min(0).max(1),
    explanation: z.string().min(1).max(1_000),
    timingMs: z.number().nonnegative(),
    auditEventType: z.string().min(1).max(120),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ResolvedHumanEntitySchema = z
  .object({
    type: z.enum([
      "application",
      "project",
      "repository",
      "file",
      "folder",
      "note",
      "calendar_event",
      "reminder",
      "person",
      "company",
      "location",
      "command",
      "skill",
      "workflow",
      "agent",
      "department",
      "semantic_object",
      "unknown",
    ]),
    value: z.string().min(1).max(300),
    normalizedValue: z.string().min(1).max(300),
    source: z.enum(["vocabulary", "alias", "synonym", "pattern", "context", "memory"]),
    confidence: z.number().min(0).max(1),
    explanation: z.string().min(1).max(500),
  })
  .strict();

export const IntentCandidateSchema = z
  .object({
    intentId: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
    requiredEntities: z.array(z.string().min(1).max(80)).max(20),
    requiredContext: z.array(z.string().min(1).max(80)).max(20),
    requiredPermissions: z.array(z.string().min(1).max(120)).max(20),
    candidateApplications: z.array(z.string().min(1).max(160)).max(20),
    candidateWorkflows: z.array(z.string().min(1).max(160)).max(20),
    fallbackStrategy: z.enum([
      "execute",
      "minor_clarification",
      "ask_clarification",
      "ai_router",
    ]),
    explanation: z.string().min(1).max(800),
  })
  .strict();

export const ConfidenceBandSchema = z.enum([
  "execute_immediately",
  "execute",
  "minor_clarification",
  "ask_clarification",
  "ai_router",
]);

export const ConfidenceHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    vocabulary: z.number().min(0).max(1),
    alias: z.number().min(0).max(1),
    synonym: z.number().min(0).max(1),
    pattern: z.number().min(0).max(1),
    behaviour: z.number().min(0).max(1),
    intent: z.number().min(0).max(1),
    entity: z.number().min(0).max(1),
    context: z.number().min(0).max(1),
    memory: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
    band: ConfidenceBandSchema,
    explanation: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ClarificationHistoryRecordSchema19A = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    question: z.string().min(1).max(500),
    reason: z.string().min(1).max(800),
    options: z.array(z.string().min(1).max(240)).max(10),
    status: z.enum(["open", "answered", "dismissed", "expired"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RetrievalHistoryRecord19ASchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestId: z.string().uuid(),
    namespace: z.string().min(1).max(80),
    query: z.string().min(1).max(500),
    memoryId: z.string().uuid().nullable(),
    similarity: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const PreferenceLearningRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    namespace: z.string().min(1).max(80),
    key: z.string().min(1).max(160),
    value: z.string().min(1).max(500),
    evidenceCount: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    source: z.enum(["conversation", "manual", "workflow", "correction"]),
    firstSeenAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    decay: z.number().min(0).max(1),
    manualOverride: z.boolean(),
    explanation: z.string().min(1).max(1_000),
    active: z.boolean(),
  })
  .strict();

export const PreferenceEvidenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    preferenceId: z.string().uuid(),
    evidence: z.string().min(1).max(1_000),
    source: z.enum(["conversation", "manual", "workflow", "correction"]),
    confidence: z.number().min(0).max(1),
    observedAt: z.iso.datetime(),
  })
  .strict();

export const ResponseTemplateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    templateKey: z.string().min(1).max(120),
    body: z.string().min(1).max(1_000),
    tone: PersonalityInteractionStateSchema,
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SocialRuleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    ruleKey: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommunicationProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    sentenceLength: z.enum(["short", "medium", "detailed"]),
    formality: z.enum(["casual", "balanced", "formal"]),
    humor: z.enum(["none", "light", "playful"]),
    questionStyle: z.enum(["direct", "guided", "collaborative"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkingProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    pace: z.enum(["careful", "balanced", "fast"]),
    autonomy: z.enum(["ask_first", "balanced", "proactive"]),
    detailLevel: z.enum(["concise", "balanced", "thorough"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DecisionProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    riskTolerance: z.enum(["low", "balanced", "high"]),
    clarificationThreshold: z.number().min(0).max(1),
    aiFallbackThreshold: z.number().min(0).max(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const PersonalityVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    version: z.number().int().positive(),
    changeSummary: z.string().min(1).max(800),
    reversible: z.literal(true),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const BootstrapProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    bootstrapVersion: z.string().min(1).max(80),
    loadedVocabulary: z.number().int().nonnegative(),
    loadedAliases: z.number().int().nonnegative(),
    loadedRules: z.number().int().nonnegative(),
    loadedTemplates: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const InteractionStatisticsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricKey: z.string().min(1).max(120),
    value: z.number().nonnegative(),
    window: z.enum(["session", "daily", "weekly", "all_time"]),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const HumanUnderstandingRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4_000),
    source: HumanUnderstandingSourceSchema.default("text"),
    conversationId: z.string().uuid().nullable().optional(),
    currentApplication: z.string().trim().min(1).max(160).nullable().optional(),
    currentWorkspace: z.string().trim().min(1).max(240).nullable().optional(),
    currentWorkflow: z.string().trim().min(1).max(240).nullable().optional(),
    simulateOnly: z.boolean().default(false),
  })
  .strict();

export const HumanUnderstandingResultSchema = z
  .object({
    requestId: z.string().uuid(),
    ownerId: z.string().uuid(),
    source: HumanUnderstandingSourceSchema,
    originalText: z.string().min(1).max(4_000),
    normalizedText: z.string().min(1).max(4_000),
    tokens: z.array(z.string().min(1).max(120)).max(500),
    vocabularyMatches: z.array(VocabularyEntrySchema).max(100),
    aliasMatches: z.array(AliasDictionaryEntrySchema).max(100),
    synonymMatches: z.array(HumanSynonymEntrySchema).max(100),
    patternMatches: z.array(PatternLibraryEntrySchema).max(50),
    behaviourRule: BehaviourRuleRecordSchema.nullable(),
    intentCandidates: z.array(IntentCandidateSchema).max(25),
    selectedIntent: IntentCandidateSchema.nullable(),
    entities: z.array(ResolvedHumanEntitySchema).max(50),
    conversationState: HumanConversationStateSchema,
    context: z.record(z.string(), z.json()),
    retrievedMemories: z.array(MemoryRecordSchema).max(25),
    confidence: ConfidenceHistoryRecordSchema,
    clarification: ClarificationHistoryRecordSchema19A.nullable(),
    plannerInput: z.record(z.string(), z.json()),
    aiFallbackReason: z.string().max(500).nullable(),
    negativeExampleMatches: z.array(CorpusEntrySchema).max(20).default([]),
    stages: z.array(UnderstandingStageRecordSchema).max(40),
    latencyMs: z.number().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const HumanUnderstandingDashboardResponseSchema = z
  .object({
    profile: PersonalityProfileSchema,
    identity: PersonalityIdentityRecordSchema,
    traits: z.array(PersonalityTraitRecordSchema).max(100),
    behaviours: z.array(PersonalityBehaviourRecordSchema).max(200),
    communicationRules: z.array(CommunicationRuleRecordSchema).max(200),
    interactionPolicies: z.array(InteractionPolicyRecordSchema).max(200),
    decisionPreferences: z.array(DecisionPreferenceRecordSchema).max(200),
    workingStyles: z.array(WorkingStyleRecordSchema).max(200),
    structuredBehaviourExamples: z.array(BehaviourExampleRecordSchema).max(200),
    learningEvents: z.array(PersonalityLearningEventRecordSchema).max(500),
    preferenceConfidence: z.array(PreferenceConfidenceRecordSchema).max(500),
    personalitySimulations: z.array(PersonalitySimulationRecordSchema).max(100),
    personalityStateHistory: z.array(PersonalityStateHistoryRecordSchema).max(500),
    responseExplanations: z.array(ResponseExplanationRecordSchema).max(100),
    corpus: CorpusDashboardResponseSchema,
    states: z.array(PersonalityStateRecordSchema).max(100),
    behaviourRules: z.array(BehaviourRuleRecordSchema).max(500),
    conversationStates: z.array(ConversationStateRecordSchema).max(500),
    conversationHistory: z.array(HumanUnderstandingResultSchema).max(100),
    interactionStatistics: z.array(InteractionStatisticsRecordSchema).max(500),
    preferenceLearning: z.array(PreferenceLearningRecordSchema).max(500),
    preferenceEvidence: z.array(PreferenceEvidenceRecordSchema).max(500),
    aliases: z.array(AliasDictionaryEntrySchema).max(1_000),
    synonyms: z.array(HumanSynonymEntrySchema).max(1_000),
    vocabulary: z.array(VocabularyEntrySchema).max(2_000),
    patterns: z.array(PatternLibraryEntrySchema).max(500),
    intentExamples: z.array(MemoryRecordSchema).max(100),
    intentStatistics: z.array(InteractionStatisticsRecordSchema).max(500),
    clarifications: z.array(ClarificationHistoryRecordSchema19A).max(500),
    confidenceHistory: z.array(ConfidenceHistoryRecordSchema).max(500),
    retrievalHistory: z.array(RetrievalHistoryRecord19ASchema).max(500),
    behaviourExamples: z.array(MemoryRecordSchema).max(100),
    responseTemplates: z.array(ResponseTemplateRecordSchema).max(500),
    socialRules: z.array(SocialRuleRecordSchema).max(500),
    communicationProfiles: z.array(CommunicationProfileRecordSchema).max(50),
    workingProfiles: z.array(WorkingProfileRecordSchema).max(50),
    decisionProfiles: z.array(DecisionProfileRecordSchema).max(50),
    personalityVersions: z.array(PersonalityVersionRecordSchema).max(200),
    bootstrapProfiles: z.array(BootstrapProfileRecordSchema).max(50),
    lastUnderstanding: HumanUnderstandingResultSchema.nullable(),
    deterministicFirst: z.literal(true),
    usesExistingVectorDatabase: z.literal(true),
    llmIsCapabilityProviderOnly: z.literal(true),
  })
  .strict();

export const PersonalityExportResponseSchema = z
  .object({
    exportedAt: z.iso.datetime(),
    dashboard: HumanUnderstandingDashboardResponseSchema,
  })
  .strict();

export const VersionCompareRequestSchema = z
  .object({
    leftVersion: z.number().int().positive(),
    rightVersion: z.number().int().positive(),
  })
  .strict();

export const VersionCompareResponseSchema = z
  .object({
    leftVersion: z.number().int().positive(),
    rightVersion: z.number().int().positive(),
    differences: z.array(z.string().min(1).max(500)).max(50),
  })
  .strict();

export type HumanUnderstandingRequest = z.infer<
  typeof HumanUnderstandingRequestSchema
>;
export type HumanConversationState = z.infer<typeof HumanConversationStateSchema>;
export type ResolvedHumanEntity = z.infer<typeof ResolvedHumanEntitySchema>;
export type HumanUnderstandingResult = z.infer<typeof HumanUnderstandingResultSchema>;
export type PersonalityProfile = z.infer<typeof PersonalityProfileSchema>;
export type PersonalityStateRecord = z.infer<typeof PersonalityStateRecordSchema>;
export type RuntimeBehaviourState = z.infer<typeof RuntimeBehaviourStateSchema>;
export type PersonalityIdentityRecord = z.infer<typeof PersonalityIdentityRecordSchema>;
export type PersonalityTraitRecord = z.infer<typeof PersonalityTraitRecordSchema>;
export type PersonalityBehaviourRecord = z.infer<typeof PersonalityBehaviourRecordSchema>;
export type CommunicationRuleRecord = z.infer<typeof CommunicationRuleRecordSchema>;
export type InteractionPolicyRecord = z.infer<typeof InteractionPolicyRecordSchema>;
export type DecisionPreferenceRecord = z.infer<typeof DecisionPreferenceRecordSchema>;
export type WorkingStyleRecord = z.infer<typeof WorkingStyleRecordSchema>;
export type BehaviourExampleRecord = z.infer<typeof BehaviourExampleRecordSchema>;
export type PersonalityLearningEventRecord = z.infer<typeof PersonalityLearningEventRecordSchema>;
export type PreferenceConfidenceRecord = z.infer<typeof PreferenceConfidenceRecordSchema>;
export type PersonalitySimulationRecord = z.infer<typeof PersonalitySimulationRecordSchema>;
export type PersonalityStateHistoryRecord = z.infer<typeof PersonalityStateHistoryRecordSchema>;
export type ResponseExplanationRecord = z.infer<typeof ResponseExplanationRecordSchema>;
export type VocabularyEntry = z.infer<typeof VocabularyEntrySchema>;
export type AliasDictionaryEntry = z.infer<typeof AliasDictionaryEntrySchema>;
export type HumanSynonymEntry = z.infer<typeof HumanSynonymEntrySchema>;
export type PatternLibraryEntry = z.infer<typeof PatternLibraryEntrySchema>;
export type BehaviourRuleRecord = z.infer<typeof BehaviourRuleRecordSchema>;
export type ConversationStateRecord = z.infer<typeof ConversationStateRecordSchema>;
export type UnderstandingStageRecord = z.infer<typeof UnderstandingStageRecordSchema>;
export type IntentCandidate = z.infer<typeof IntentCandidateSchema>;
export type ConfidenceHistoryRecord = z.infer<typeof ConfidenceHistoryRecordSchema>;
export type ClarificationHistoryRecord19A = z.infer<
  typeof ClarificationHistoryRecordSchema19A
>;
export type RetrievalHistoryRecord19A = z.infer<
  typeof RetrievalHistoryRecord19ASchema
>;
export type PreferenceLearningRecord = z.infer<typeof PreferenceLearningRecordSchema>;
export type PreferenceEvidenceRecord = z.infer<typeof PreferenceEvidenceRecordSchema>;
export type ResponseTemplateRecord = z.infer<typeof ResponseTemplateRecordSchema>;
export type SocialRuleRecord = z.infer<typeof SocialRuleRecordSchema>;
export type CommunicationProfileRecord = z.infer<
  typeof CommunicationProfileRecordSchema
>;
export type WorkingProfileRecord = z.infer<typeof WorkingProfileRecordSchema>;
export type DecisionProfileRecord = z.infer<typeof DecisionProfileRecordSchema>;
export type PersonalityVersionRecord = z.infer<typeof PersonalityVersionRecordSchema>;
export type BootstrapProfileRecord = z.infer<typeof BootstrapProfileRecordSchema>;
export type InteractionStatisticsRecord = z.infer<
  typeof InteractionStatisticsRecordSchema
>;
export type HumanUnderstandingDashboardResponse = z.infer<
  typeof HumanUnderstandingDashboardResponseSchema
>;
export type VersionCompareRequest = z.infer<typeof VersionCompareRequestSchema>;
