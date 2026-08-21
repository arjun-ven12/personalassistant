import { z } from "zod";

export const LocalModelRoleSchema = z.enum([
  "NATURAL_LANGUAGE_INTERPRETER",
  "GENERAL_LOCAL_REASONER",
  "CONVERSATION",
  "STRUCTURED_EXTRACTION",
  "SUMMARIZATION",
  "WRITING_ASSISTANT",
  "CODING_ASSISTANT",
  "VISION",
]);
export const LocalModelMemoryClassSchema = z.enum(["tiny", "small", "medium", "large"]);
export const LocalInferenceModeSchema = z.enum(["interpretation", "conversation"]);
export const LocalInferencePrioritySchema = z.enum([
  "INTERACTIVE_VOICE",
  "INTERACTIVE_TEXT",
  "BACKGROUND_AGENT",
  "BACKGROUND_SUMMARY",
]);
export const LocalRuntimeStateSchema = z.enum([
  "AVAILABLE",
  "UNAVAILABLE",
  "LOADING",
  "READY",
  "BUSY",
  "ERROR",
  "UNLOADING",
]);

export const LocalModelDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    runtime: z.string().min(1).max(80),
    modelName: z.string().min(1).max(160),
    displayName: z.string().min(1).max(160),
    roles: z.array(LocalModelRoleSchema).min(1).max(20),
    contextWindow: z.number().int().positive().optional(),
    multimodal: z.boolean(),
    structuredOutput: z.boolean(),
    toolCalling: z.literal(false),
    estimatedMemoryClass: LocalModelMemoryClassSchema,
    enabled: z.boolean(),
    priority: z.number().int().min(0).max(100),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export const LocalIntentInterpretationSchema = z
  .object({
    intent: z.string().trim().min(1).max(160).nullable(),
    entities: z.record(z.string(), z.json()),
    confidence: z.number().min(0).max(1),
    requiresClarification: z.boolean(),
    clarificationCandidates: z
      .array(
        z
          .object({
            type: z.string().min(1).max(80),
            id: z.string().min(1).max(160).optional(),
            label: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    reasoningRequired: z.boolean().optional(),
    nonExecution: z.boolean().optional(),
  })
  .strict();

export const LocalGenerationRequestSchema = z
  .object({
    model: z.string().min(1).max(160),
    system: z.string().min(1).max(4_000),
    prompt: z.string().min(1).max(16_000),
    temperature: z.number().min(0).max(1).default(0.2),
    maxOutputTokens: z.number().int().min(1).max(2_048).default(512),
    priority: LocalInferencePrioritySchema.default("INTERACTIVE_TEXT"),
    timeoutMs: z.number().int().min(100).max(120_000).default(45_000),
  })
  .strict();
export const LocalStructuredGenerationRequestSchema =
  LocalGenerationRequestSchema.extend({
    schemaName: z.string().min(1).max(120),
    schemaDescription: z.string().min(1).max(2_000),
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
  }).strict();

export const LocalInferenceEventSchema = z
  .object({
    requestId: z.string().uuid(),
    runtime: z.string().min(1).max(80),
    model: z.string().min(1).max(160),
    role: LocalModelRoleSchema,
    mode: LocalInferenceModeSchema,
    source: z.enum([
      "voice",
      "text",
      "gesture",
      "dashboard",
      "planner",
      "agent",
      "api",
    ]),
    status: z.enum(["success", "failure", "timeout", "unavailable", "invalid"]),
    durationMs: z.number().nonnegative(),
    queueWaitMs: z.number().nonnegative(),
    inputSize: z.number().int().nonnegative(),
    outputSize: z.number().int().nonnegative(),
    structuredValid: z.boolean(),
    errorCode: z.string().max(120).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const LocalAIHealthSchema = z
  .object({
    enabled: z.boolean(),
    runtime: z.string().min(1).max(80),
    runtimeAvailable: z.boolean(),
    baseUrl: z.literal("local"),
    model: z.string().min(1).max(160),
    modelAvailable: z.boolean(),
    modelReady: z.boolean(),
    state: LocalRuntimeStateSchema,
    queueDepth: z.number().int().nonnegative(),
    lastLatencyMs: z.number().nonnegative().nullable(),
    averageLatencyMs: z.number().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    lastSuccessfulRequest: z.iso.datetime().nullable(),
  })
  .strict();
export const LocalAIStatsSchema = z
  .object({
    requestCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    averageLatencyMs: z.number().nonnegative(),
    lastLatencyMs: z.number().nonnegative().nullable(),
    queueDepth: z.number().int().nonnegative(),
    events: z.array(LocalInferenceEventSchema).max(100),
  })
  .strict();

export type LocalModelDefinition = z.infer<typeof LocalModelDefinitionSchema>;
export type LocalModelRole = z.infer<typeof LocalModelRoleSchema>;
export type LocalInferencePriority = z.infer<typeof LocalInferencePrioritySchema>;
export type LocalIntentInterpretation = z.infer<typeof LocalIntentInterpretationSchema>;
export type LocalGenerationRequest = z.infer<typeof LocalGenerationRequestSchema>;
export type LocalStructuredGenerationRequest = z.infer<
  typeof LocalStructuredGenerationRequestSchema
>;
export type LocalInferenceEvent = z.infer<typeof LocalInferenceEventSchema>;
export type LocalAIHealth = z.infer<typeof LocalAIHealthSchema>;
export type LocalAIStats = z.infer<typeof LocalAIStatsSchema>;
