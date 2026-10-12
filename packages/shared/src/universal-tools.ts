import { z } from "zod";
import { ApprovalRequirementSchema, RiskLevelSchema } from "./tools.js";

const Id = z.string().trim().regex(/^[a-z][a-z0-9_.:-]{2,119}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const JsonSchema = z.json();

export const UniversalToolProviderSchema = z.object({
  id: Id,
  ownerId: z.string().uuid(),
  companyId: z.string().uuid().nullable(),
  sourceType: z.enum(["MCP_REMOTE", "MCP_LOCAL", "API", "NATIVE", "LOCAL"]),
  displayName: z.string().trim().min(1).max(120),
  endpoint: z.url().nullable(),
  credentialReferenceId: z.string().uuid().nullable(),
  status: z.enum(["DISABLED", "REVIEW_REQUIRED", "ENABLED", "REVOKED"]),
  health: z.enum(["UNKNOWN", "HEALTHY", "DEGRADED", "UNAVAILABLE", "AUTH_REQUIRED"]),
  version: z.string().min(1).max(80),
  updatedAt: z.iso.datetime(),
}).strict();

export const UniversalToolSchema = z.object({
  id: Id,
  providerId: Id,
  ownerId: z.string().uuid(),
  companyId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  capabilityCategory: Id,
  department: Id,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  schemaDigest: Digest,
  operationClass: z.enum(["READ", "WRITE", "DESTRUCTIVE", "EXTERNAL_PUBLISH", "FINANCIAL"]),
  riskLevel: RiskLevelSchema,
  approvalRequirement: ApprovalRequirementSchema,
  costModel: z.enum(["FREE", "FIXED_PER_CALL", "USAGE_BASED", "SUBSCRIPTION_INCLUDED", "UNKNOWN"]),
  rateLimitPerMinute: z.number().int().min(1).max(10_000),
  enabled: z.boolean(),
  version: z.string().min(1).max(80),
  updatedAt: z.iso.datetime(),
}).strict();

export const UniversalToolRequestSchema = z.object({
  invocationId: z.string().uuid(),
  toolId: Id,
  arguments: z.json(),
  approvalId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8).max(160).nullable(),
  requestedAt: z.iso.datetime(),
}).strict();

export const UniversalToolReviewSchema = z.object({
  ownerId: z.string().uuid(),
  companyId: z.string().uuid(),
  providerId: Id,
  toolId: Id,
  schemaDigest: Digest,
  providerVersion: z.string().min(1).max(80),
  riskLevel: RiskLevelSchema,
  approvalRequirement: ApprovalRequirementSchema,
  credentialReferenceId: z.string().uuid().nullable(),
  governanceToolName: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
  status: z.enum(["REVIEWED", "ENABLED", "DISABLED", "REVOKED"]),
  reviewedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const UniversalToolResultSchema = z.object({
  invocationId: z.string().uuid(),
  toolId: Id,
  providerId: Id,
  status: z.enum(["SUCCEEDED", "FAILED", "DENIED", "APPROVAL_REQUIRED", "INDETERMINATE"]),
  structuredOutput: z.json().nullable(),
  boundedTextOutput: z.string().max(16_384).nullable(),
  externalOperationId: z.string().max(240).nullable(),
  failureCode: z.string().max(100).nullable(),
  retryable: z.boolean(),
  costMinor: z.number().int().nonnegative().nullable().optional(),
  costCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  ownerAcceptance: z.enum(["ACCEPTED", "REJECTED"]).nullable().optional(),
  toolVersion: z.string().min(1).max(80).optional(),
  toolSchemaDigest: Digest.optional(),
  capabilityCategory: Id.optional(),
  environment: UniversalToolProviderSchema.shape.sourceType.optional(),
  latencyMs: z.number().nonnegative(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
}).strict();

export type UniversalToolProvider = z.infer<typeof UniversalToolProviderSchema>;
export type UniversalTool = z.infer<typeof UniversalToolSchema>;
export type UniversalToolRequest = z.infer<typeof UniversalToolRequestSchema>;
export type UniversalToolReview = z.infer<typeof UniversalToolReviewSchema>;
export type UniversalToolResult = z.infer<typeof UniversalToolResultSchema>;
