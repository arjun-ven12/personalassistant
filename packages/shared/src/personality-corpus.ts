import { z } from "zod";

export const CorpusEntryTypeSchema = z.enum([
  "identity",
  "trait",
  "policy",
  "social_rule",
  "response_template",
  "vocabulary",
  "alias",
  "synonym",
  "intent",
  "intent_example",
  "negative_intent_example",
  "pattern",
  "entity_type",
  "normalization_rule",
  "conversation_example",
  "context_chain",
  "temporal_example",
  "asr_example",
  "clarification_rule",
  "confidence_rule",
  "personality_profile",
  "learning_threshold",
  "planner_preference",
  "voice_behaviour_rule",
  "agent_inheritance_rule",
]);

export const CorpusSeveritySchema = z.enum(["info", "warning", "critical"]);

export const CorpusPackageSourceSchema = z
  .object({
    kind: z.enum(["canonical_markdown", "compiled_json"]),
    path: z.string().min(1).max(1_000),
    checksum: z.string().min(8).max(128),
  })
  .strict();

export const CorpusManifestSchema = z
  .object({
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    schemaVersion: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
    source: CorpusPackageSourceSchema,
    checksum: z.string().min(8).max(128),
    entryCounts: z.record(z.string(), z.number().int().nonnegative()),
    intentCount: z.number().int().nonnegative(),
    aliasCount: z.number().int().nonnegative(),
    exampleCount: z.number().int().nonnegative(),
    negativeExampleCount: z.number().int().nonnegative(),
    vectorSeedCount: z.number().int().nonnegative(),
    profileCount: z.number().int().nonnegative(),
    breakingChanges: z.array(z.string().min(1).max(500)).max(50),
    minimumRuntimeVersion: z.string().min(1).max(80),
  })
  .strict();

export const CorpusVersionSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    schemaVersion: z.string().min(1).max(40),
    checksum: z.string().min(8).max(128),
    active: z.boolean(),
    manifest: CorpusManifestSchema,
    importedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const CorpusEntityValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
]);

export const CorpusEntrySchema = z
  .object({
    id: z.string().min(1).max(240),
    ownerId: z.string().uuid(),
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    entryType: CorpusEntryTypeSchema,
    domain: z.string().min(1).max(120),
    utterance: z.string().min(1).max(1_000).nullable(),
    normalizedUtterance: z.string().min(1).max(1_000).nullable(),
    intent: z.string().min(1).max(160).nullable(),
    entities: z.record(z.string(), CorpusEntityValueSchema).default({}),
    deterministicCandidate: z.boolean(),
    vectorSeed: z.boolean(),
    requiresAi: z.boolean(),
    mustNotExecute: z.array(z.string().min(1).max(160)).max(50),
    blockedIntentCandidates: z.array(z.string().min(1).max(160)).max(50),
    riskLevel: z.enum(["none", "low", "medium", "high", "critical"]),
    reason: z.string().min(1).max(800).nullable(),
    tags: z.array(z.string().min(1).max(80)).max(50),
    sourceSection: z.string().min(1).max(240),
    sourceLine: z.number().int().positive(),
    raw: z.record(z.string(), z.unknown()),
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CorpusValidationIssueSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    severity: CorpusSeveritySchema,
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(1_000),
    entryId: z.string().min(1).max(240).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CorpusValidationResultSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    status: z.enum(["passed", "warning", "failed"]),
    criticalCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    infoCount: z.number().int().nonnegative(),
    issues: z.array(CorpusValidationIssueSchema).max(2_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CorpusImportRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    corpusId: z.string().min(1).max(160),
    corpusVersion: z.string().min(1).max(80),
    checksum: z.string().min(8).max(128),
    status: z.enum(["started", "validated", "imported", "failed"]),
    entriesImported: z.number().int().nonnegative(),
    vectorSeedsImported: z.number().int().nonnegative(),
    negativeExamplesImported: z.number().int().nonnegative(),
    message: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CorpusDashboardResponseSchema = z
  .object({
    activeVersion: CorpusVersionSchema.nullable(),
    manifest: CorpusManifestSchema.nullable(),
    entries: z.array(CorpusEntrySchema).max(2_000),
    imports: z.array(CorpusImportRecordSchema).max(100),
    validationResults: z.array(CorpusValidationResultSchema).max(100),
    negativeExamples: z.array(CorpusEntrySchema).max(500),
    vectorSeeds: z.array(CorpusEntrySchema).max(500),
  })
  .strict();

export const CorpusTestUtteranceRequestSchema = z
  .object({
    utterance: z.string().min(1).max(1_000),
    conversationContext: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const CorpusTestUtteranceResponseSchema = z
  .object({
    rawInput: z.string().min(1).max(1_000),
    normalizedInput: z.string().min(0).max(1_000),
    candidateIntent: z.string().min(1).max(160).nullable(),
    candidateEntities: z.record(z.string(), z.unknown()),
    negativeExampleMatches: z.array(CorpusEntrySchema).max(20),
    confidence: z.number().min(0).max(1),
    aiUsed: z.literal(false),
    mustNotExecute: z.boolean(),
    reason: z.string().min(1).max(1_000),
  })
  .strict();

export type CorpusManifest = z.infer<typeof CorpusManifestSchema>;
export type CorpusVersion = z.infer<typeof CorpusVersionSchema>;
export type CorpusEntry = z.infer<typeof CorpusEntrySchema>;
export type CorpusValidationIssue = z.infer<typeof CorpusValidationIssueSchema>;
export type CorpusValidationResult = z.infer<typeof CorpusValidationResultSchema>;
export type CorpusImportRecord = z.infer<typeof CorpusImportRecordSchema>;
export type CorpusDashboardResponse = z.infer<typeof CorpusDashboardResponseSchema>;
export type CorpusTestUtteranceRequest = z.infer<
  typeof CorpusTestUtteranceRequestSchema
>;
export type CorpusTestUtteranceResponse = z.infer<
  typeof CorpusTestUtteranceResponseSchema
>;
