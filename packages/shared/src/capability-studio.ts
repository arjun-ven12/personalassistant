import { z } from "zod";

import { AdapterPermissionSchema, RegistryIdSchema } from "./applications.js";
import {
  NativeProviderCapabilitySchema,
  NativeProviderDashboardResponseSchema,
} from "./native-providers.js";

export const CapabilityCandidateStatusSchema = z.enum([
  "DRAFT",
  "RECORDED",
  "VALIDATING",
  "REVIEW_REQUIRED",
  "APPROVED",
  "ACTIVE",
  "FAILED",
  "DEPRECATED",
  "REVOKED",
]);

export const CapabilityCandidateSourceSchema = z.enum([
  "RECORDING",
  "DESCRIPTION",
  "AGENT_REQUEST",
]);

export const CapabilityTargetResolverSchema = z
  .object({
    role: z.string().trim().min(1).max(80).nullable().default(null),
    label: z.string().trim().min(1).max(240).nullable().default(null),
    identifier: z.string().trim().min(1).max(240).nullable().default(null),
    applicationScoped: z.literal(true),
    usesCoordinates: z.literal(false),
    usesElementOrder: z.boolean().default(false),
  })
  .strict();

export const CapabilityValidationSchema = z
  .object({
    status: z.enum(["NOT_RUN", "PASSED", "FAILED"]),
    safetyPassed: z.boolean(),
    targetStabilityPassed: z.boolean(),
    providerBindingPassed: z.boolean(),
    permissionMappingPassed: z.boolean(),
    diagnostics: z.array(z.string().min(1).max(300)).max(30),
    validatedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CapabilityTestSummarySchema = z
  .object({
    status: z.enum(["NOT_RUN", "PASSED", "FAILED"]),
    attempts: z.number().int().min(0).max(10),
    targetResolutionSuccesses: z.number().int().min(0).max(10),
    verificationSuccesses: z.number().int().min(0).max(10),
    averageLatencyMs: z.number().nonnegative(),
    safeDryRun: z.literal(true),
    testedAt: z.iso.datetime().nullable(),
    failureReason: z.string().min(1).max(300).nullable(),
  })
  .strict();

export const CapabilityCandidateSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    providerId: RegistryIdSchema,
    name: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    description: z.string().trim().min(1).max(1_000),
    primitive: NativeProviderCapabilitySchema,
    source: CapabilityCandidateSourceSchema,
    status: CapabilityCandidateStatusSchema,
    version: z.number().int().positive(),
    recordingId: z.string().uuid().nullable(),
    inputSchema: z.record(z.string().min(1).max(80), z.string().min(1).max(120)),
    requiredPermissions: z.array(AdapterPermissionSchema).max(30),
    riskLevel: z.enum(["read_only", "low", "medium", "high", "prohibited"]),
    targetResolver: CapabilityTargetResolverSchema,
    verificationStrategy: z.string().trim().min(1).max(500),
    validation: CapabilityValidationSchema,
    testSummary: CapabilityTestSummarySchema,
    duplicateOfCapabilityId: z.string().uuid().nullable(),
    approvalRequestId: z.string().uuid().nullable(),
    approvalActionId: z.string().uuid().nullable(),
    createdBy: z.enum(["OWNER", "AGENT"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CapabilityStudioEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    candidateId: z.string().uuid().nullable(),
    applicationId: RegistryIdSchema,
    type: z.enum([
      "CREATED",
      "RECORDED",
      "VALIDATED",
      "TESTED",
      "APPROVAL_REQUESTED",
      "ACTIVATED",
      "DEPRECATED",
      "REVOKED",
      "FAILED",
      "AGENT_REQUESTED",
    ]),
    summary: z.string().trim().min(1).max(500),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CapabilityRequestSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    applicationId: RegistryIdSchema,
    requestedIntent: z.string().trim().min(1).max(500),
    desiredOutcome: z.string().trim().min(1).max(1_000),
    contextSummary: z.string().trim().min(1).max(500),
    requestedBy: z.enum(["OWNER", "AGENT"]),
    requestingAgentId: z.string().min(1).max(160).nullable(),
    status: z.enum(["OPEN", "CANDIDATE_CREATED", "DISMISSED"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateCapabilityFromDescriptionRequestSchema = z
  .object({
    applicationId: RegistryIdSchema,
    description: z.string().trim().min(5).max(1_000),
  })
  .strict();

export const CreateCapabilityFromRecordingRequestSchema = z
  .object({
    applicationId: RegistryIdSchema,
    recordingId: z.string().uuid(),
    name: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,79}$/).optional(),
  })
  .strict();

export const CapabilityCandidateIdRequestSchema = z
  .object({ candidateId: z.string().uuid() })
  .strict();

export const ChangeCapabilityStateRequestSchema = z
  .object({
    candidateId: z.string().uuid(),
    action: z.enum(["DEPRECATE", "REVOKE", "ROLLBACK"]),
  })
  .strict();

export const CreateCapabilityRequestSchema = z
  .object({
    applicationId: RegistryIdSchema,
    requestedIntent: z.string().trim().min(3).max(500),
    desiredOutcome: z.string().trim().min(3).max(1_000),
    contextSummary: z.string().trim().min(1).max(500).default("No context supplied."),
    requestedBy: z.enum(["OWNER", "AGENT"]).default("OWNER"),
    requestingAgentId: z.string().trim().min(1).max(160).nullable().default(null),
  })
  .strict();

export const CapabilityStudioResponseSchema = NativeProviderDashboardResponseSchema.extend({
  candidates: z.array(CapabilityCandidateSchema).max(500),
  history: z.array(CapabilityStudioEventSchema).max(1_000),
  requests: z.array(CapabilityRequestSchema).max(500),
  semanticRecordingOnly: z.literal(true),
  candidatesRequireApproval: z.literal(true),
  arbitraryExecutionAvailable: z.literal(false),
}).strict();

export type CapabilityCandidate = z.infer<typeof CapabilityCandidateSchema>;
export type CapabilityStudioEvent = z.infer<typeof CapabilityStudioEventSchema>;
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;
export type CreateCapabilityFromDescriptionRequest = z.infer<
  typeof CreateCapabilityFromDescriptionRequestSchema
>;
export type CreateCapabilityFromRecordingRequest = z.infer<
  typeof CreateCapabilityFromRecordingRequestSchema
>;
export type CapabilityCandidateIdRequest = z.infer<
  typeof CapabilityCandidateIdRequestSchema
>;
export type ChangeCapabilityStateRequest = z.infer<
  typeof ChangeCapabilityStateRequestSchema
>;
export type CreateCapabilityRequest = z.infer<typeof CreateCapabilityRequestSchema>;
export type CapabilityStudioResponse = z.infer<typeof CapabilityStudioResponseSchema>;
