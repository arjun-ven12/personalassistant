import { z } from "zod";

import { IntentCandidateSchema, ResolvedHumanEntitySchema } from "./human-understanding.js";

export const AlexaConversationClassificationSchema = z.enum([
  "ANSWER",
  "ACTION",
  "MULTI_INTENT",
  "CLARIFY",
  "NON_EXECUTION",
]);

export const AlexaSpeechActSchema = z.enum([
  "QUESTION",
  "ACTION_REQUEST",
  "STATEMENT",
  "HYPOTHETICAL",
  "QUOTED_COMMAND",
  "NEGATIVE_COMMAND",
  "PAST_ACTION_REFERENCE",
  "FOLLOW_UP",
  "MULTI_INTENT",
]);

export const ConversationRouteStageSchema = z.enum([
  "PRECODED",
  "MEMORY",
  "PAGE",
  "APPLICATION_CONTEXT",
  "GEMMA",
  "GPT",
  "ACTION",
  "CLARIFICATION",
  "NON_EXECUTION",
  "EXECUTIVE_BRAIN",
  "REFLECTION_ENGINE",
  "SKILL_EVOLUTION",
]);

export const ConversationContextReferenceSchema = z
  .object({
    source: z.enum([
      "ACTIVE_PAGE",
      "SELECTION",
      "FOCUSED_ELEMENT",
      "APPLICATION",
      "WORKSPACE",
      "PROJECT",
      "DOCUMENT",
      "MEMORY",
      "KNOWLEDGE_GRAPH",
      "RECENT_ACTIVITY",
      "CONVERSATION",
      "EXECUTION_EVENT",
    ]),
    id: z.string().min(1).max(240),
    label: z.string().min(1).max(240),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const ActiveConversationContextSchema = z
  .object({
    deviceId: z.string().uuid().nullable().default(null),
    applicationId: z.string().min(1).max(160).nullable().default(null),
    applicationName: z.string().min(1).max(160).nullable().default(null),
    windowId: z.string().min(1).max(180).nullable().default(null),
    windowTitle: z.string().max(240).nullable().default(null),
    documentTitle: z.string().max(240).nullable().default(null),
    url: z.string().url().max(2_000).nullable().default(null),
    workspaceId: z.string().min(1).max(240).nullable().default(null),
    projectId: z.string().min(1).max(240).nullable().default(null),
    selectedText: z.string().max(2_000).nullable().default(null),
    focusedElement: z.string().max(240).nullable().default(null),
    semanticContentReference: z.string().max(240).nullable().default(null),
    adapterId: z.string().max(160).nullable().default(null),
    providerId: z.string().max(160).nullable().default(null),
    capturedAt: z.iso.datetime(),
    authority: z.literal("CONTEXT_ONLY"),
  })
  .strict();

export const ConversationIntentStepSchema = z
  .object({
    order: z.number().int().positive().max(20),
    type: z.enum(["ANSWER", "ACTION", "CLARIFY", "NON_EXECUTION"]),
    answer: z.string().max(2_000).nullable().default(null),
    intent: IntentCandidateSchema.nullable().default(null),
    entities: z.array(ResolvedHumanEntitySchema).max(30).default([]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const interpretationBase = {
  confidence: z.number().min(0).max(1),
  speechAct: AlexaSpeechActSchema,
  contextReferences: z.array(ConversationContextReferenceSchema).max(50).default([]),
  safeExplanation: z.string().min(1).max(500),
} as const;

export const AlexaConversationInterpretationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ANSWER"),
      ...interpretationBase,
      answer: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("ACTION"),
      ...interpretationBase,
      intent: IntentCandidateSchema,
      entities: z.array(ResolvedHumanEntitySchema).max(30).default([]),
    })
    .strict(),
  z
    .object({
      type: z.literal("MULTI_INTENT"),
      ...interpretationBase,
      steps: z.array(ConversationIntentStepSchema).min(2).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("CLARIFY"),
      ...interpretationBase,
      question: z.string().min(1).max(500),
      missingInformation: z.array(z.string().min(1).max(240)).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("NON_EXECUTION"),
      ...interpretationBase,
      answer: z.string().min(1).max(2_000).nullable().default(null),
    })
    .strict(),
]);

export const ConversationModelInterpretationSchema = z
  .object({
    type: AlexaConversationClassificationSchema,
    confidence: z.number().min(0).max(1),
    speechAct: AlexaSpeechActSchema,
    answer: z.string().max(2_000),
    actionIntent: z.string().max(160),
    steps: z.array(z.string().max(500)).max(20),
    question: z.string().max(500),
    missingInformation: z.array(z.string().min(1).max(240)).max(20),
    contextSources: z
      .array(ConversationContextReferenceSchema.shape.source)
      .max(20),
    safeExplanation: z.string().min(1).max(500),
  })
  .strict();

export const ConversationModelInterpretationJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: AlexaConversationClassificationSchema.options },
    confidence: { type: "number" },
    speechAct: { type: "string", enum: AlexaSpeechActSchema.options },
    answer: { type: "string" },
    actionIntent: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    question: { type: "string" },
    missingInformation: { type: "array", items: { type: "string" } },
    contextSources: {
      type: "array",
      items: { type: "string", enum: ConversationContextReferenceSchema.shape.source.options },
    },
    safeExplanation: { type: "string" },
  },
  required: [
    "type",
    "confidence",
    "speechAct",
    "answer",
    "actionIntent",
    "steps",
    "question",
    "missingInformation",
    "contextSources",
    "safeExplanation",
  ],
  additionalProperties: false,
} as const;

export const ConversationProviderAttemptReferenceSchema = z
  .object({
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    locality: z.enum(["LOCAL", "REMOTE"]),
    status: z.enum(["SUCCESS", "FAILED", "REJECTED", "SKIPPED"]),
    reason: z.string().max(300),
    latencyMs: z.number().nonnegative().nullable(),
  })
  .strict();

export const ConversationTurnFeedbackKindSchema = z.enum([
  "CORRECT",
  "WRONG",
  "WRONG_ROUTE",
  "WRONG_ANSWER",
  "SHOULD_HAVE_BEEN_ACTION",
  "SHOULD_NOT_HAVE_BEEN_ACTION",
  "BAD_CLARIFICATION",
  "MISSING_CONTEXT",
]);

export const ConversationTurnFeedbackRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    turnId: z.string().uuid(),
    kind: ConversationTurnFeedbackKindSchema,
    note: z.string().trim().max(500).nullable(),
    learningApplied: z.literal(false),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SubmitConversationTurnFeedbackRequestSchema = z
  .object({
    kind: ConversationTurnFeedbackKindSchema,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const ReplayConversationTurnRequestSchema = z
  .object({
    route: z.enum(["DETERMINISTIC", "GEMMA", "GPT"]),
  })
  .strict();

export const ReplayConversationTurnResponseSchema = z
  .object({
    turnId: z.string().uuid(),
    route: z.enum(["DETERMINISTIC", "GEMMA", "GPT"]),
    mode: z.literal("DRY_RUN"),
    execution: z.literal("NO_EXECUTION"),
    classification: AlexaConversationClassificationSchema,
    responseText: z.string().max(2_000).nullable(),
    interpretation: AlexaConversationInterpretationSchema.nullable(),
    providerId: z.string().max(80).nullable(),
    modelId: z.string().max(160).nullable(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

export type AlexaConversationClassification = z.infer<
  typeof AlexaConversationClassificationSchema
>;
export type AlexaSpeechAct = z.infer<typeof AlexaSpeechActSchema>;
export type ConversationRouteStage = z.infer<typeof ConversationRouteStageSchema>;
export type ConversationContextReference = z.infer<
  typeof ConversationContextReferenceSchema
>;
export type ActiveConversationContext = z.infer<
  typeof ActiveConversationContextSchema
>;
export type AlexaConversationInterpretation = z.infer<
  typeof AlexaConversationInterpretationSchema
>;
export type ConversationModelInterpretation = z.infer<
  typeof ConversationModelInterpretationSchema
>;
export type ConversationProviderAttemptReference = z.infer<
  typeof ConversationProviderAttemptReferenceSchema
>;
export type ConversationTurnFeedbackRecord = z.infer<
  typeof ConversationTurnFeedbackRecordSchema
>;
