import { z } from "zod";

import { AgentRoleSchema } from "./agents.js";

const boundedRef = z.string().min(3).max(160);

export const AgentDefinitionStatusSchema = z.enum(["ACTIVE", "RETIRED"]);
export const AgentDefinitionProvenanceSchema = z.enum([
  "ALEXA_CREATED",
  "OWNER_CREATED",
  "IMPORTED",
  "SYSTEM",
]);

export const AgentDefinitionSchema = z
  .object({
    id: boundedRef,
    ownerId: z.string().uuid(),
    canonicalKey: z
      .string()
      .min(3)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1).max(120),
    role: AgentRoleSchema,
    description: z.string().min(1).max(1_000),
    skills: z.array(z.string().min(2).max(120)).min(1).max(50),
    capabilityRequirements: z.array(boundedRef).min(1).max(80),
    supportedTasks: z.array(boundedRef).min(1).max(80),
    defaultModelPolicy: z.enum([
      "CHEAP_ROUTINE",
      "LOCAL_FIRST",
      "BALANCED",
      "STRONG_REASONING",
      "SECURITY_REVIEW",
    ]),
    defaultSafetyPolicy: boundedRef,
    defaultOperatingPolicy: boundedRef,
    executionPlacement: z.enum([
      "LOCAL",
      "REMOTE_ALLOWED",
      "REMOTE_PREFERRED",
      "LOCAL_ONLY",
    ]),
    evaluationProfile: z.array(z.string().min(2).max(120)).min(1).max(20),
    generalizedReputationPrior: z.number().min(0).max(100),
    generalizedCalibrationPrior: z.number().min(0).max(1),
    provenance: AgentDefinitionProvenanceSchema,
    sourcePath: z.string().max(500).nullable(),
    sourceVersion: z.string().max(80).nullable(),
    license: z.string().max(80).nullable(),
    version: z.string().min(1).max(40),
    status: AgentDefinitionStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CompanyAgentAssignmentStatusSchema = z.enum([
  "DORMANT",
  "ACTIVE",
  "PAUSED",
  "REVOKED",
]);

export const CompanyAgentAssignmentSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    agentDefinitionId: boundedRef,
    organizationId: z.string().uuid(),
    departmentId: z.string().uuid().nullable(),
    managerAssignmentId: z.string().uuid().nullable(),
    managerAgentDefinitionId: boundedRef.nullable(),
    governorAssignmentId: z.string().uuid().nullable(),
    status: CompanyAgentAssignmentStatusSchema,
    memoryScopeId: boundedRef,
    departmentMemoryScopeId: boundedRef.nullable(),
    organizationMemoryScopeId: boundedRef,
    capabilityGrantProfileId: boundedRef,
    economyPolicyId: boundedRef,
    modelPolicyOverride: AgentDefinitionSchema.shape.defaultModelPolicy.nullable(),
    localReputation: z.number().min(0).max(100).nullable(),
    localCalibration: z.number().min(0).max(1).nullable(),
    companyInstructions: z.string().max(2_000).nullable(),
    isGovernor: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const CatalogCompanyStatusSchema = z.enum([
  "ASSIGNED",
  "AVAILABLE",
  "UNAVAILABLE",
  "CAPABILITY_GAP",
  "POLICY_RESTRICTED",
]);

export const AgentCatalogItemSchema = z
  .object({
    definition: AgentDefinitionSchema,
    currentCompanyStatus: CatalogCompanyStatusSchema,
    assignment: CompanyAgentAssignmentSchema.nullable(),
    assignedCompanyCount: z.number().int().nonnegative(),
    effectiveCapabilities: z.array(boundedRef).max(80),
    missingCapabilities: z.array(boundedRef).max(80),
  })
  .strict();

export const AgentCatalogResponseSchema = z
  .object({
    catalogCount: z.number().int().nonnegative(),
    assignedCount: z.number().int().nonnegative(),
    activeRuntimeCount: z.number().int().nonnegative(),
    items: z.array(AgentCatalogItemSchema).max(1_000),
    runtime: z
      .object({
        modelSessionsFromDefinitions: z.literal(0),
        workersFromAssignments: z.literal(0),
        pollingLoopsFromAssignments: z.literal(0),
        sharedAIRouter: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const AgentCatalogQuerySchema = z
  .object({
    q: z.string().trim().max(160).default(""),
    state: CatalogCompanyStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(500),
  })
  .strict();

export const AssignCatalogAgentRequestSchema = z
  .object({
    departmentId: z.string().uuid().optional(),
    companyInstructions: z.string().trim().max(2_000).optional(),
  })
  .strict();

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type CompanyAgentAssignment = z.infer<typeof CompanyAgentAssignmentSchema>;
export type AgentCatalogItem = z.infer<typeof AgentCatalogItemSchema>;
