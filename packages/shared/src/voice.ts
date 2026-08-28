import { z } from "zod";

import { SubmitCommandResponseSchema } from "./intent.js";
import {
  ActiveConversationContextSchema,
  AlexaConversationClassificationSchema,
  AlexaConversationInterpretationSchema,
  AlexaSpeechActSchema,
  ConversationContextReferenceSchema,
  ConversationProviderAttemptReferenceSchema,
  ConversationRouteStageSchema,
  ConversationTurnFeedbackRecordSchema,
} from "./conversation.js";

export const VoiceRuntimeStateSchema = z.enum([
  "stopped",
  "initializing",
  "listening",
  "wake_word_detected",
  "recording",
  "transcribing",
  "understanding",
  "planning",
  "executing",
  "responding",
  "interrupted",
  "paused",
  "recovering",
  "idle",
]);

export const VoiceSessionStatusSchema = z.enum([
  "initializing",
  "listening",
  "recording",
  "paused",
  "stopped",
  "failed",
  "completed",
]);

export const VoiceProfileModeSchema = z.enum([
  "default",
  "professional",
  "technical",
  "concise",
  "friendly",
  "presentation",
  "custom",
]);

export const MicrophonePermissionStateSchema = z.enum([
  "not_requested",
  "prompt",
  "granted",
  "denied",
  "unavailable",
  "unknown",
]);

export const VoiceProviderSchema = z.enum([
  "browser_speech_recognition",
  "browser_speech_synthesis",
  "configured_provider",
  "disabled",
  "unknown",
]);

export const VoiceResponseSourceSchema = z.enum(["PRECODED", "GEMMA", "GPT"]);

export const VoicePageContextSchema = z
  .object({
    pathname: z.string().regex(/^\/[a-z0-9/_-]*$/i).max(240),
    url: z.string().url().max(2_000).nullable().default(null),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_000).nullable(),
    headings: z.array(z.string().trim().min(1).max(240)).max(30),
    content: z.array(z.string().trim().min(1).max(300)).max(40),
    selectedText: z.string().trim().max(2_000).nullable().default(null),
    focusedElement: z.string().trim().max(240).nullable().default(null),
    chunks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(240),
            kind: z.enum(["TITLE", "SELECTION", "INTRO", "HEADING", "SECTION", "CONCLUSION"]),
            text: z.string().trim().min(1).max(1_200),
            relevance: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    extractionStatus: z
      .enum(["AVAILABLE", "PARTIAL", "CONTENT_UNAVAILABLE"])
      .default("AVAILABLE"),
    controls: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(240),
            label: z.string().trim().min(1).max(200),
            role: z.string().trim().min(1).max(80),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(60),
    authority: z.literal("CONTEXT_ONLY"),
  })
  .strict();

export const ConversationLifecycleStateSchema = z.enum([
  "idle",
  "listening",
  "understanding",
  "clarifying",
  "planning",
  "responding",
  "waiting",
  "interrupted",
  "resuming",
  "completed",
  "archived",
]);

export const ConversationPersonaModeSchema = z.enum([
  "professional",
  "engineer",
  "technical_mentor",
  "executive",
  "teacher",
  "research_assistant",
  "creative",
  "concise",
  "friendly",
  "custom",
]);

export const EmotionalProsodySchema = z.enum([
  "calm",
  "energetic",
  "neutral",
  "focused",
  "encouraging",
  "celebratory",
  "urgent",
  "concerned",
]);

export const VoiceSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    status: VoiceSessionStatusSchema,
    runtimeState: VoiceRuntimeStateSchema,
    microphoneDeviceId: z.string().min(1).max(240).nullable(),
    wakeWordEnabled: z.boolean(),
    localAudioOnly: z.literal(true),
    rawAudioPersisted: z.literal(false),
    transcriptCount: z.number().int().nonnegative(),
    interruptionCount: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VoiceProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    mode: VoiceProfileModeSchema,
    speakingStyle: z.string().min(1).max(500),
    sttLanguage: z.string().min(2).max(40),
    ttsVoice: z.string().min(1).max(160).nullable(),
    ttsRate: z.number().min(0.5).max(2),
    ttsPitch: z.number().min(0).max(2),
    ttsVolume: z.number().min(0).max(1),
    wakeWordSensitivity: z.number().min(0).max(1),
    vadThreshold: z.number().min(0).max(1),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const VoiceShortcutRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    phrase: z.string().trim().min(1).max(160),
    intentTemplate: z.string().trim().min(1).max(1_000),
    enabled: z.boolean(),
    safetyLevel: z.enum(["informational", "read_only", "low_risk", "moderate_risk"]),
    approvalRequired: z.boolean(),
    version: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid().nullable().default(null),
    sessionId: z.string().uuid().nullable(),
    role: z.enum(["user", "assistant", "system"]),
    transcript: z.string().trim().min(1).max(4_000),
    normalizedTranscript: z.string().trim().min(1).max(4_000),
    confidence: z.number().min(0).max(1),
    isFinal: z.boolean(),
    language: z.string().min(2).max(40).nullable(),
    wakeWordDetected: z.boolean(),
    interruption: z.boolean(),
    commandId: z.string().uuid().nullable(),
    intentCreated: z.boolean(),
    responseText: z.string().max(2_000).nullable(),
    responseSource: VoiceResponseSourceSchema.default("PRECODED"),
    responseProviderId: z.string().min(1).max(80).nullable().default(null),
    responseModelId: z.string().min(1).max(160).nullable().default(null),
    classification: AlexaConversationClassificationSchema.nullable().default(null),
    speechAct: AlexaSpeechActSchema.nullable().default(null),
    interpretation: AlexaConversationInterpretationSchema.nullable().default(null),
    routeStages: z.array(ConversationRouteStageSchema).max(20).default(["PRECODED"]),
    activeContext: ActiveConversationContextSchema.nullable().default(null),
    contextReferences: z.array(ConversationContextReferenceSchema).max(50).default([]),
    providerAttempts: z
      .array(ConversationProviderAttemptReferenceSchema)
      .max(10)
      .default([]),
    latencyMs: z.number().nonnegative().default(0),
    tokenUsage: z.record(z.string(), z.number().nonnegative()).nullable().default(null),
    costUsd: z.string().regex(/^\d+(\.\d{1,8})?$/).nullable().default(null),
    economicReservationId: z.string().uuid().nullable().default(null),
    executionStatus: z
      .enum(["NONE", "PLANNED", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"])
      .default("NONE"),
    clarificationReason: z.string().max(500).nullable().default(null),
    safeExplanation: z.string().max(500).nullable().default(null),
    contextSourceCount: z.number().int().nonnegative().default(0),
    pageChunkCount: z.number().int().nonnegative().default(0),
    memoryItemCount: z.number().int().nonnegative().default(0),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const VoiceMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    provider: VoiceProviderSchema,
    runtimeState: VoiceRuntimeStateSchema,
    recognitionLatencyMs: z.number().nonnegative(),
    intentLatencyMs: z.number().nonnegative(),
    ttsLatencyMs: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    interruption: z.boolean(),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const MicrophonePreferenceRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    selectedDeviceId: z.string().min(1).max(240).nullable(),
    permissionState: MicrophonePermissionStateSchema,
    echoCancellation: z.boolean(),
    noiseSuppression: z.boolean(),
    autoGainControl: z.boolean(),
    inputGain: z.number().min(0).max(1),
    diagnosticsEnabled: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WakeWordSettingsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    enabled: z.boolean(),
    wakeWords: z.array(z.string().trim().min(1).max(40)).min(1).max(5),
    sensitivity: z.number().min(0).max(1),
    cooldownMs: z.number().int().min(250).max(30_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TtsProfileRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    profileId: z.string().uuid(),
    provider: VoiceProviderSchema,
    voiceName: z.string().min(1).max(160).nullable(),
    speakingRate: z.number().min(0.5).max(2),
    pitch: z.number().min(0).max(2),
    volume: z.number().min(0).max(1),
    streamingEnabled: z.boolean(),
    sentenceStreaming: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SttProviderMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    provider: VoiceProviderSchema,
    available: z.boolean(),
    averageLatencyMs: z.number().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
    failureRate: z.number().min(0).max(1),
    lastCheckedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    voiceSessionId: z.string().uuid().nullable(),
    title: z.string().min(1).max(180),
    lifecycleState: ConversationLifecycleStateSchema,
    currentTopicId: z.string().uuid().nullable(),
    currentGoalId: z.string().uuid().nullable(),
    modality: z.enum(["voice", "text", "gesture", "spatial", "desktop", "mixed"]),
    personaId: z.string().uuid().nullable(),
    openQuestionCount: z.number().int().nonnegative(),
    lastUserMessageAt: z.iso.datetime().nullable(),
    lastAssistantMessageAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationTopicRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    parentTopicId: z.string().uuid().nullable(),
    title: z.string().min(1).max(180),
    summary: z.string().min(1).max(1_000),
    keywords: z.array(z.string().min(1).max(80)).max(25),
    status: z.enum(["active", "paused", "resolved", "archived"]),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationGoalRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    goal: z.string().min(1).max(500),
    status: z.enum(["open", "clarifying", "planned", "completed", "blocked"]),
    progress: z.number().min(0).max(1),
    linkedCommandId: z.string().uuid().nullable(),
    evidence: z.array(z.string().min(1).max(240)).max(20),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationSummaryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    summaryType: z.enum(["session", "daily", "topic", "planning", "research"]),
    summary: z.string().min(1).max(2_000),
    openQuestions: z.array(z.string().min(1).max(300)).max(20),
    decisions: z.array(z.string().min(1).max(300)).max(20),
    followUps: z.array(z.string().min(1).max(300)).max(20),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ConversationPersonaRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(120),
    mode: ConversationPersonaModeSchema,
    vocabulary: z.enum(["plain", "technical", "executive", "teaching", "creative"]),
    sentenceLength: z.enum(["short", "medium", "detailed"]),
    humor: z.enum(["none", "light", "warm", "playful"]),
    formality: z.enum(["casual", "balanced", "formal"]),
    questionStyle: z.enum(["direct", "guided", "exploratory"]),
    prosody: EmotionalProsodySchema,
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ClarificationHistoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    transcriptId: z.string().uuid().nullable(),
    question: z.string().min(1).max(500),
    reason: z.string().min(1).max(500),
    status: z.enum(["open", "answered", "dismissed"]),
    answer: z.string().max(1_000).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationContextRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    currentPage: z.string().min(1).max(120).nullable(),
    repositoryId: z.string().uuid().nullable(),
    workflowId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    activeAgentIds: z.array(z.string().min(1).max(120)).max(25),
    memoryReferences: z.array(z.string().min(1).max(160)).max(50),
    plannerState: z.enum([
      "none",
      "draft",
      "clarifying",
      "planned",
      "waiting_approval",
    ]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ContinuityResolutionSourceSchema = z.enum([
  "PENDING_SLOT",
  "ACTIVE_SELECTION",
  "ACTIVE_CONTEXT",
  "CONVERSATION_TOPIC",
  "ACTION_PROPOSAL",
  "ORDINAL_REFERENCE",
  "RECENT_REFERENCE",
  "MEMORY",
  "AI",
  "CLARIFY",
]);

export const ContinuityReferenceSchema = z
  .object({
    id: z.string().min(1).max(240),
    kind: z.enum(["selection", "document", "application", "person", "file", "option", "topic", "other"]),
    label: z.string().min(1).max(500),
    value: z.string().min(1).max(2_000),
    source: ContinuityResolutionSourceSchema,
    confidence: z.number().min(0).max(1),
    deviceId: z.string().uuid().nullable().default(null),
    resolvedAt: z.iso.datetime(),
  })
  .strict();

export const PendingConversationIntentSchema = z
  .object({
    id: z.string().uuid(),
    deviceId: z.string().uuid().nullable().default(null),
    voiceSessionId: z.string().uuid().nullable().default(null),
    canonicalIntent: z.string().min(1).max(120),
    originalUtterance: z.string().min(1).max(4_000),
    resolvedSlots: z.record(z.string().min(1).max(80), z.json()),
    missingSlots: z.array(z.string().min(1).max(80)).max(12),
    activeContextReferenceId: z.string().max(240).nullable(),
    status: z.enum(["AWAITING_CLARIFICATION", "READY", "CANCELLED", "COMPLETED", "EXPIRED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const ConversationActionProposalSchema = z
  .object({
    id: z.string().uuid(),
    sourceTurnId: z.string().uuid().nullable().default(null),
    governedCommandId: z.string().uuid().nullable().default(null),
    deviceId: z.string().uuid().nullable().default(null),
    voiceSessionId: z.string().uuid().nullable().default(null),
    canonicalIntent: z.string().min(1).max(120),
    canonicalRequest: z.string().min(1).max(4_000),
    parameters: z.record(z.string().min(1).max(80), z.json()),
    targets: z.array(ContinuityReferenceSchema).max(25),
    sourceContextReferenceId: z.string().max(240).nullable(),
    riskLevel: z.enum(["informational", "low_risk", "moderate_risk", "high_risk", "critical"]),
    status: z.enum(["PROPOSED", "CONFIRMED", "PLANNED", "CANCELLED", "EXPIRED", "EXECUTED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const ContinuityProcessedTurnSchema = z
  .object({
    turnId: z.string().uuid(),
    handled: z.boolean(),
    responseText: z.string().max(2_000).nullable(),
    canonicalRequest: z.string().max(4_000).nullable(),
    processedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationContinuityRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    deviceId: z.string().uuid().nullable(),
    voiceSessionId: z.string().uuid().nullable(),
    topic: z.string().max(500).nullable(),
    references: z.array(ContinuityReferenceSchema).max(20),
    pendingIntent: PendingConversationIntentSchema.nullable(),
    actionProposal: ConversationActionProposalSchema.nullable(),
    lastAssistantResponse: z.string().max(2_000).nullable(),
    processedTurns: z.array(ContinuityProcessedTurnSchema).max(50),
    resolutionPath: z.array(ContinuityResolutionSourceSchema).max(12),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ConversationAnalyticsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    messageCount: z.number().int().nonnegative(),
    clarificationCount: z.number().int().nonnegative(),
    interruptionCount: z.number().int().nonnegative(),
    routedIntentCount: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
    goalCompletionRate: z.number().min(0).max(1),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const ConversationBookmarkRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    conversationId: z.string().uuid(),
    label: z.string().min(1).max(120),
    note: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CreateVoiceSessionRequestSchema = z
  .object({
    microphoneDeviceId: z.string().min(1).max(240).nullable().optional(),
    wakeWordEnabled: z.boolean().default(true),
    reuseActiveSession: z.boolean().default(false),
  })
  .strict();

export const RecordVoiceTranscriptRequestSchema = z
  .object({
    sessionId: z.string().uuid().nullable().optional(),
    turnId: z.string().uuid().optional(),
    interruptedTurnId: z.string().uuid().optional(),
    transcript: z.string().trim().min(1).max(4_000),
    isFinal: z.boolean().default(true),
    confidence: z.number().min(0).max(1),
    language: z.string().min(2).max(40).nullable().optional(),
    wakeWordDetected: z.boolean().default(false),
    source: z.enum(["browser", "electron", "android", "api"]).default("browser"),
    pageContext: VoicePageContextSchema.optional(),
  })
  .strict();

export const DeviceVoiceRuntimePayloadSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("start_session"),
      session: CreateVoiceSessionRequestSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("submit_transcript"),
      transcript: RecordVoiceTranscriptRequestSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("cancel_turn"),
      turnId: z.string().uuid(),
      sessionId: z.string().uuid().nullable().optional(),
      reason: z.enum(["barge_in", "owner_stop", "transport_disconnect"]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("capture_lease"),
      action: z.enum(["acquire", "takeover", "heartbeat", "release", "status"]),
      voiceSessionId: z.string().uuid(),
    })
    .strict(),
]);

export const VoiceCaptureClientTypeSchema = z.enum(["WEB", "OVERLAY", "ANDROID"]);
export const VoiceCaptureLeaseRequestSchema = z
  .object({
    action: z.enum(["acquire", "takeover", "heartbeat", "release", "status"]),
    voiceSessionId: z.string().uuid(),
  })
  .strict();

export const VoiceCaptureLeaseResponseSchema = z
  .object({
    status: z.enum(["ACQUIRED", "DENIED", "FREE"]),
    owner: VoiceCaptureClientTypeSchema.nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();

export const VoiceTurnCancellationResponseSchema = z
  .object({
    turnId: z.string().uuid(),
    cancelled: z.boolean(),
    state: z.literal("interrupted"),
  })
  .strict();

export const RecordVoiceMetricRequestSchema = z
  .object({
    sessionId: z.string().uuid().nullable().optional(),
    provider: VoiceProviderSchema.default("browser_speech_recognition"),
    runtimeState: VoiceRuntimeStateSchema,
    recognitionLatencyMs: z.number().nonnegative().default(0),
    intentLatencyMs: z.number().nonnegative().default(0),
    ttsLatencyMs: z.number().nonnegative().default(0),
    confidence: z.number().min(0).max(1).default(0),
    interruption: z.boolean().default(false),
  })
  .strict();

export const UpsertVoiceProfileRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    mode: VoiceProfileModeSchema.default("custom"),
    speakingStyle: z.string().trim().min(1).max(500),
    sttLanguage: z.string().min(2).max(40).default("en-US"),
    ttsVoice: z.string().min(1).max(160).nullable().optional(),
    ttsRate: z.number().min(0.5).max(2).default(1),
    ttsPitch: z.number().min(0).max(2).default(1),
    ttsVolume: z.number().min(0).max(1).default(1),
    wakeWordSensitivity: z.number().min(0).max(1).default(0.7),
    vadThreshold: z.number().min(0).max(1).default(0.5),
    active: z.boolean().default(false),
  })
  .strict();

export const UpsertVoiceShortcutRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    phrase: z.string().trim().min(1).max(160),
    intentTemplate: z.string().trim().min(1).max(1_000),
    enabled: z.boolean().default(true),
    safetyLevel: z
      .enum(["informational", "read_only", "low_risk", "moderate_risk"])
      .default("low_risk"),
    approvalRequired: z.boolean().default(false),
  })
  .strict();

export const VoiceDashboardResponseSchema = z
  .object({
    sessions: z.array(VoiceSessionRecordSchema),
    profiles: z.array(VoiceProfileRecordSchema),
    shortcuts: z.array(VoiceShortcutRecordSchema),
    conversationHistory: z.array(ConversationHistoryRecordSchema),
    metrics: z.array(VoiceMetricRecordSchema),
    microphonePreferences: z.array(MicrophonePreferenceRecordSchema),
    wakeWordSettings: z.array(WakeWordSettingsRecordSchema),
    ttsProfiles: z.array(TtsProfileRecordSchema),
    sttProviderMetrics: z.array(SttProviderMetricRecordSchema),
    conversationSessions: z.array(ConversationSessionRecordSchema),
    conversationTopics: z.array(ConversationTopicRecordSchema),
    conversationGoals: z.array(ConversationGoalRecordSchema),
    conversationSummaries: z.array(ConversationSummaryRecordSchema),
    conversationPersonas: z.array(ConversationPersonaRecordSchema),
    clarificationHistory: z.array(ClarificationHistoryRecordSchema),
    conversationContext: z.array(ConversationContextRecordSchema),
    conversationAnalytics: z.array(ConversationAnalyticsRecordSchema),
    conversationBookmarks: z.array(ConversationBookmarkRecordSchema),
    runtime: z
      .object({
        persistent: z.literal(true),
        state: VoiceRuntimeStateSchema,
        browserSupported: z.boolean(),
        electronSupported: z.boolean(),
        routesThroughIntentEngine: z.literal(true),
        voiceCanApproveHighRisk: z.literal(false),
        rawAudioPersisted: z.literal(false),
        localAudioOnlyByDefault: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const ConversationCenterResponseSchema = z
  .object({
    sessions: z.array(ConversationSessionRecordSchema),
    topics: z.array(ConversationTopicRecordSchema),
    goals: z.array(ConversationGoalRecordSchema),
    summaries: z.array(ConversationSummaryRecordSchema),
    personas: z.array(ConversationPersonaRecordSchema),
    clarifications: z.array(ClarificationHistoryRecordSchema),
    context: z.array(ConversationContextRecordSchema),
    analytics: z.array(ConversationAnalyticsRecordSchema),
    bookmarks: z.array(ConversationBookmarkRecordSchema),
    history: z.array(ConversationHistoryRecordSchema),
    feedback: z.array(ConversationTurnFeedbackRecordSchema),
    continuity: z.array(ConversationContinuityRecordSchema).default([]),
    secure: z
      .object({
        hiddenReasoningExposed: z.literal(false),
        bypassesIntentEngine: z.literal(false),
        autonomousExecution: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const UpsertConversationPersonaRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    mode: ConversationPersonaModeSchema,
    vocabulary: z.enum(["plain", "technical", "executive", "teaching", "creative"]),
    sentenceLength: z.enum(["short", "medium", "detailed"]),
    humor: z.enum(["none", "light", "warm", "playful"]),
    formality: z.enum(["casual", "balanced", "formal"]),
    questionStyle: z.enum(["direct", "guided", "exploratory"]),
    prosody: EmotionalProsodySchema,
    active: z.boolean().default(false),
  })
  .strict();

export const CreateConversationBookmarkRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    note: z.string().trim().min(1).max(500),
  })
  .strict();

export const VoiceTranscriptResponseSchema = z
  .object({
    dashboard: VoiceDashboardResponseSchema,
    conversation: ConversationHistoryRecordSchema,
    commandResponse: SubmitCommandResponseSchema.nullable(),
    routed: z.boolean(),
    responseText: z.string().max(2_000).nullable(),
    responseSource: VoiceResponseSourceSchema,
    responseProviderId: z.string().min(1).max(80).nullable(),
    responseModelId: z.string().min(1).max(160).nullable(),
    approvalRequestId: z.string().uuid().nullable().default(null),
    classification: AlexaConversationClassificationSchema,
    routeStages: z.array(ConversationRouteStageSchema).max(20),
  })
  .strict();

export type VoiceRuntimeState = z.infer<typeof VoiceRuntimeStateSchema>;
export type VoiceSessionStatus = z.infer<typeof VoiceSessionStatusSchema>;
export type VoiceProfileMode = z.infer<typeof VoiceProfileModeSchema>;
export type MicrophonePermissionState = z.infer<typeof MicrophonePermissionStateSchema>;
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;
export type VoiceResponseSource = z.infer<typeof VoiceResponseSourceSchema>;
export type VoicePageContext = z.infer<typeof VoicePageContextSchema>;
export type VoiceSessionRecord = z.infer<typeof VoiceSessionRecordSchema>;
export type VoiceProfileRecord = z.infer<typeof VoiceProfileRecordSchema>;
export type VoiceShortcutRecord = z.infer<typeof VoiceShortcutRecordSchema>;
export type ConversationHistoryRecord = z.infer<typeof ConversationHistoryRecordSchema>;
export type VoiceMetricRecord = z.infer<typeof VoiceMetricRecordSchema>;
export type MicrophonePreferenceRecord = z.infer<
  typeof MicrophonePreferenceRecordSchema
>;
export type WakeWordSettingsRecord = z.infer<typeof WakeWordSettingsRecordSchema>;
export type TtsProfileRecord = z.infer<typeof TtsProfileRecordSchema>;
export type SttProviderMetricRecord = z.infer<typeof SttProviderMetricRecordSchema>;
export type ConversationSessionRecord = z.infer<typeof ConversationSessionRecordSchema>;
export type ConversationTopicRecord = z.infer<typeof ConversationTopicRecordSchema>;
export type ConversationGoalRecord = z.infer<typeof ConversationGoalRecordSchema>;
export type ConversationSummaryRecord = z.infer<typeof ConversationSummaryRecordSchema>;
export type ConversationPersonaRecord = z.infer<typeof ConversationPersonaRecordSchema>;
export type ClarificationHistoryRecord = z.infer<
  typeof ClarificationHistoryRecordSchema
>;
export type ConversationContextRecord = z.infer<typeof ConversationContextRecordSchema>;
export type ContinuityResolutionSource = z.infer<typeof ContinuityResolutionSourceSchema>;
export type ContinuityReference = z.infer<typeof ContinuityReferenceSchema>;
export type PendingConversationIntent = z.infer<typeof PendingConversationIntentSchema>;
export type ConversationActionProposal = z.infer<typeof ConversationActionProposalSchema>;
export type ConversationContinuityRecord = z.infer<typeof ConversationContinuityRecordSchema>;
export type ConversationAnalyticsRecord = z.infer<
  typeof ConversationAnalyticsRecordSchema
>;
export type ConversationBookmarkRecord = z.infer<
  typeof ConversationBookmarkRecordSchema
>;
export type CreateVoiceSessionRequest = z.infer<typeof CreateVoiceSessionRequestSchema>;
export type RecordVoiceTranscriptRequest = z.infer<
  typeof RecordVoiceTranscriptRequestSchema
>;
export type DeviceVoiceRuntimePayload = z.infer<typeof DeviceVoiceRuntimePayloadSchema>;
export type VoiceCaptureClientType = z.infer<typeof VoiceCaptureClientTypeSchema>;
export type VoiceCaptureLeaseRequest = z.infer<typeof VoiceCaptureLeaseRequestSchema>;
export type VoiceCaptureLeaseResponse = z.infer<typeof VoiceCaptureLeaseResponseSchema>;
export type VoiceTurnCancellationResponse = z.infer<
  typeof VoiceTurnCancellationResponseSchema
>;
export type RecordVoiceMetricRequest = z.infer<typeof RecordVoiceMetricRequestSchema>;
export type UpsertVoiceProfileRequest = z.infer<typeof UpsertVoiceProfileRequestSchema>;
export type UpsertVoiceShortcutRequest = z.infer<
  typeof UpsertVoiceShortcutRequestSchema
>;
export type VoiceDashboardResponse = z.infer<typeof VoiceDashboardResponseSchema>;
export type VoiceTranscriptResponse = z.infer<typeof VoiceTranscriptResponseSchema>;
export type ConversationCenterResponse = z.infer<
  typeof ConversationCenterResponseSchema
>;
export type UpsertConversationPersonaRequest = z.infer<
  typeof UpsertConversationPersonaRequestSchema
>;
export type CreateConversationBookmarkRequest = z.infer<
  typeof CreateConversationBookmarkRequestSchema
>;
