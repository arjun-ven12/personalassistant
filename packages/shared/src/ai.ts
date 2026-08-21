import { z } from "zod";

export const AIProviderTypeSchema = z.enum(["LOCAL", "CLOUD", "HYBRID", "ENTERPRISE"]);
export const AIRequestPurposeSchema = z.enum([
  "INTERPRETATION",
  "CONVERSATION",
  "SUMMARIZATION",
  "CLASSIFICATION",
  "EXTRACTION",
  "REASONING",
  "PLANNING_ASSIST",
  "CODING",
  "WRITING",
  "VISION",
  "EVALUATION",
  "OTHER",
]);
export const AIReasoningPreferenceSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]);
export const AIPrivacyRequirementSchema = z.enum([
  "STANDARD",
  "LOCAL_ONLY",
  "NO_EXTERNAL",
]);
export const AIOutputModeSchema = z.enum(["TEXT", "STRUCTURED", "JSON"]);
export const AIModelRoleSchema = z.enum([
  "FAST_INTERPRETER",
  "GENERAL_REASONER",
  "CODER",
  "DEEP_REASONER",
  "WRITER",
  "VISION",
  "EMBEDDING",
]);
export const AIModalitySchema = z.enum(["TEXT", "IMAGE", "AUDIO", "VIDEO"]);
export const AIModelSelectorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("MODEL"),
      providerId: z.string().min(1).max(80),
      modelId: z.string().min(1).max(160),
    })
    .strict(),
  z.object({ type: z.literal("ROLE"), role: AIModelRoleSchema }).strict(),
]);
export const AIContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(16_000) }).strict(),
  z
    .object({ type: z.literal("image"), reference: z.string().min(1).max(1_000) })
    .strict(),
  z.object({ type: z.literal("json"), value: z.json() }).strict(),
  z.object({ type: z.literal("tool_result"), value: z.json() }).strict(),
]);
export const AIInputMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.array(AIContentPartSchema).min(1).max(20),
  })
  .strict();
export const AIContextBlockSchema = z
  .object({
    sourceType: z.enum([
      "ALEXA_SYSTEM",
      "USER",
      "MEMORY",
      "KNOWLEDGE",
      "TOOL",
      "EXTERNAL",
      "AGENT",
    ]),
    trustLevel: z.enum(["SYSTEM", "TRUSTED", "UNTRUSTED"]),
    content: z.json(),
  })
  .strict();
export const AITraceContextSchema = z
  .object({
    traceId: z.string().min(1).max(160).optional(),
    agentId: z.string().uuid().optional(),
    workflowId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
  })
  .strict();
export const AIInferenceRequestSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    model: AIModelSelectorSchema.optional(),
    purpose: AIRequestPurposeSchema,
    input: z.array(AIInputMessageSchema).min(1).max(100),
    systemInstructions: z.array(z.string().min(1).max(4_000)).max(20).optional(),
    context: z.array(AIContextBlockSchema).max(100).optional(),
    outputMode: AIOutputModeSchema.default("TEXT"),
    temperature: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().int().min(1).max(8_192).optional(),
    reasoning: AIReasoningPreferenceSchema.optional(),
    timeoutMs: z.number().int().min(100).max(180_000).default(45_000),
    metadata: z.record(z.string(), z.json()).optional(),
    trace: AITraceContextSchema.optional(),
  })
  .strict();
export const AIUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  })
  .strict();
export const AIInferenceResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    status: z.enum(["SUCCESS", "FAILED", "PARTIAL"]),
    outputText: z.string().optional(),
    structuredOutput: z.json().optional(),
    finishReason: z.string().max(120).optional(),
    usage: AIUsageSchema.optional(),
    latencyMs: z.number().nonnegative(),
    providerRequestId: z.string().max(240).optional(),
    warnings: z.array(z.string().max(300)).max(20).optional(),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export const AIModelCapabilitiesSchema = z
  .object({
    textGeneration: z.boolean(),
    structuredOutput: z.boolean(),
    reasoning: z.boolean(),
    toolCalling: z.literal(false),
    vision: z.boolean(),
    embeddings: z.boolean(),
    streaming: z.boolean(),
  })
  .strict();
export const AIModelCostMetadataSchema = z
  .object({
    currency: z.literal("USD"),
    inputPerMillionTokens: z.number().nonnegative().optional(),
    cachedInputPerMillionTokens: z.number().nonnegative().optional(),
    outputPerMillionTokens: z.number().nonnegative().optional(),
    lastUpdatedAt: z.iso.datetime().optional(),
    source: z.string().max(240).optional(),
  })
  .strict();
export const AIModelDescriptorSchema = z
  .object({
    modelId: z.string().min(1).max(160),
    providerId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(160),
    family: z.string().max(120).optional(),
    version: z.string().max(120).optional(),
    enabled: z.boolean(),
    capabilities: AIModelCapabilitiesSchema,
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    modality: z.array(AIModalitySchema).max(10),
    locality: z.enum(["LOCAL", "REMOTE"]),
    approximateMemoryMb: z.number().int().positive().optional(),
    cost: AIModelCostMetadataSchema.optional(),
    tags: z.array(z.string().max(80)).max(30).optional(),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export const AIProviderCapabilitiesSchema = z
  .object({
    structuredOutput: z.boolean(),
    textGeneration: z.boolean(),
    reasoning: z.boolean(),
    vision: z.boolean(),
    embeddings: z.boolean(),
    streaming: z.boolean(),
  })
  .strict();
export const AIProviderHealthSchema = z
  .object({
    providerId: z.string().min(1).max(80),
    status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNCONFIGURED"]),
    latencyMs: z.number().nonnegative().nullable(),
    lastCheckedAt: z.iso.datetime(),
    errorCategory: z.string().max(120).nullable(),
    version: z.string().max(120).nullable(),
    modelsVisible: z.number().int().nonnegative(),
  })
  .strict();
export const AIProviderDescriptorSchema = z
  .object({
    providerId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(160),
    providerType: AIProviderTypeSchema,
    enabled: z.boolean(),
    configured: z.boolean(),
    capabilities: AIProviderCapabilitiesSchema,
    credentialState: z.enum(["CONFIGURED", "MISSING", "NOT_REQUIRED"]),
    trustClassification: z
      .enum(["TRUSTED_LOCAL", "APPROVED_CLOUD", "UNTRUSTED"])
      .optional(),
    baseEndpoint: z.literal("local").or(z.literal("remote")).optional(),
    health: AIProviderHealthSchema.optional(),
  })
  .strict();
export const AIProviderErrorCodeSchema = z.enum([
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_UNCONFIGURED",
  "AUTHENTICATION_FAILED",
  "MODEL_NOT_FOUND",
  "MODEL_UNAVAILABLE",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "CAPABILITY_NOT_SUPPORTED",
  "CONTEXT_LIMIT_EXCEEDED",
  "OUTPUT_VALIDATION_FAILED",
  "TIMEOUT",
  "CANCELLED",
  "NETWORK_ERROR",
  "PROVIDER_ERROR",
  "MODEL_ROLE_UNCONFIGURED",
  "UNKNOWN",
]);
export const AIModelRoleMappingSchema = z
  .object({
    role: AIModelRoleSchema,
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    enabled: z.boolean(),
  })
  .strict();
export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;
export type AIProviderErrorCode = z.infer<typeof AIProviderErrorCodeSchema>;
export type AIRequestPurpose = z.infer<typeof AIRequestPurposeSchema>;
export type AIReasoningPreference = z.infer<typeof AIReasoningPreferenceSchema>;
export type AIModelRole = z.infer<typeof AIModelRoleSchema>;
export type AIModelSelector = z.infer<typeof AIModelSelectorSchema>;
export type AIContextBlock = z.infer<typeof AIContextBlockSchema>;
export type AIInferenceRequest = z.input<typeof AIInferenceRequestSchema>;
export type AIInferenceResponse = z.infer<typeof AIInferenceResponseSchema>;
export type AIModelDescriptor = z.infer<typeof AIModelDescriptorSchema>;
export type AIProviderCapabilities = z.infer<typeof AIProviderCapabilitiesSchema>;
export type AIProviderHealth = z.infer<typeof AIProviderHealthSchema>;
export type AIProviderDescriptor = z.infer<typeof AIProviderDescriptorSchema>;
export type AIModelRoleMapping = z.infer<typeof AIModelRoleMappingSchema>;
