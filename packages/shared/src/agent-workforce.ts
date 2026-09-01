import { z } from "zod";

import {
  AgentEconomyAccountSchema,
  AgentEconomyPerformanceSchema,
} from "./agent-economy.js";
import { AgentRecordSchema, AgentTaskRecordSchema } from "./agents.js";
import { DepartmentRecordSchema, OrganizationRecordSchema } from "./agent-society.js";

export const DepartmentTemplateSchema = z
  .object({
    id: z.string().min(3).max(120),
    canonicalKey: z.string().min(3).max(120),
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(120),
    genericPurpose: z.string().min(1).max(1_000),
    suggestedManagerRole: z.string().min(1).max(120).nullable(),
    suggestedAgentRoles: z.array(z.string().min(1).max(120)).max(20),
    defaultPolicyHints: z.array(z.string().min(1).max(240)).max(20),
    provenance: z.enum(["SYSTEM", "OWNER_CREATED"]),
    status: z.enum(["ACTIVE", "RETIRED"]),
  })
  .strict();

export const DepartmentTemplateListResponseSchema = z
  .object({
    templates: z.array(DepartmentTemplateSchema).max(100),
  })
  .strict();

export const CreateWorkforceDepartmentRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(1_000),
    parentDepartmentId: z.string().uuid().nullable().optional(),
    templateId: z.string().min(3).max(120).nullable().optional(),
    managerDefinitionId: z.string().min(3).max(160).nullable().optional(),
    initialDefinitionIds: z.array(z.string().min(3).max(160)).max(20).default([]),
  })
  .strict();

export const UpdateWorkforceDepartmentRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    purpose: z.string().trim().min(1).max(1_000).optional(),
    parentDepartmentId: z.string().uuid().nullable().optional(),
    managerDefinitionId: z.string().min(3).max(160).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide a department change.");

export const ArchiveWorkforceDepartmentRequestSchema = z
  .object({
    relocateToDepartmentId: z.string().uuid().nullable(),
  })
  .strict();

export const MoveWorkforceAgentRequestSchema = z
  .object({
    departmentId: z.string().uuid().nullable(),
  })
  .strict();

export const WorkforceEventTypeSchema = z.enum([
  "REGISTERED",
  "ACTIVATED",
  "DORMANT",
  "SUSPENDED",
  "TASK_ASSIGNED",
  "TASK_COMPLETED",
  "CAPABILITY_REQUESTED",
  "MEMORY_RECORDED",
]);

export const WorkforceEventSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    type: WorkforceEventTypeSchema,
    summary: z.string().min(1).max(500),
    referenceId: z.string().max(160).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkforceImportReportSchema = z
  .object({
    sourceDefinitionsScanned: z.number().int().nonnegative(),
    importedAsAgents: z.number().int().nonnegative(),
    alexaNativeAgentsAdded: z.number().int().nonnegative(),
    finalActualRegisteredAgents: z.number().int().nonnegative(),
    convertedToSkills: z.number().int().nonnegative(),
    convertedToWorkflows: z.number().int().nonnegative(),
    convertedToReviewers: z.number().int().nonnegative(),
    duplicatesRejected: z.number().int().nonnegative(),
    activeDuringIdle: z.number().int().nonnegative(),
    dormantDuringIdle: z.number().int().nonnegative(),
    sourceCommit: z.string().min(7).max(80),
    sourceLicense: z.string().min(1).max(80),
    externalRuntimeActive: z.literal(false),
    providerCallsDuringImport: z.literal(0),
    runtimeActivationsDuringImport: z.literal(0),
  })
  .strict();

export const WorkforceGraphNodeSchema = z
  .object({
    id: z.string().min(3).max(160),
    kind: z.enum(["GOVERNOR", "DEPARTMENT", "AGENT"]),
    label: z.string().min(1).max(160),
    subtitle: z.string().max(160),
    parentId: z.string().max(160).nullable(),
    departmentId: z.string().uuid().nullable(),
    status: z.enum(["ACTIVE", "DORMANT", "BLOCKED", "SUSPENDED", "FAILED"]),
    reputation: z.number().min(0).max(100).nullable(),
    credits: z.number().int().nonnegative().nullable(),
    source: z.enum(["ALEXA_NATIVE", "EVERYTHING_CLAUDE_CODE"]).nullable(),
    childCount: z.number().int().nonnegative(),
  })
  .strict();

export const WorkforceGraphEdgeSchema = z
  .object({
    id: z.string().min(3).max(300),
    source: z.string().min(3).max(160),
    target: z.string().min(3).max(160),
    type: z.enum(["REPORTS_TO", "RECENT_ACTIVITY"]),
  })
  .strict();

export const WorkforceGraphResponseSchema = z
  .object({
    organization: OrganizationRecordSchema.nullable(),
    departments: z.array(DepartmentRecordSchema).max(100),
    nodes: z.array(WorkforceGraphNodeSchema).max(1_000),
    edges: z.array(WorkforceGraphEdgeSchema).max(2_000),
    summary: z
      .object({
        registered: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        dormant: z.number().int().nonnegative(),
        suspended: z.number().int().nonnegative(),
        departments: z.number().int().nonnegative(),
        memoryScopes: z.number().int().nonnegative(),
        capabilityProfiles: z.number().int().nonnegative(),
        aggregateCredits: z.number().int().nonnegative(),
        averageReputation: z.number().min(0).max(100),
      })
      .strict(),
    bootstrapAvailable: z.boolean(),
    importPreview: WorkforceImportReportSchema,
    runtime: z
      .object({
        modelInstancesFromRegistration: z.literal(0),
        workerProcessesFromRegistration: z.literal(0),
        providerCallsFromRegistration: z.literal(0),
        sharedAIRouter: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const WorkforceAgentDetailSchema = z
  .object({
    agent: AgentRecordSchema,
    department: DepartmentRecordSchema.nullable(),
    manager: AgentRecordSchema.nullable(),
    children: z.array(AgentRecordSchema).max(500),
    economy: AgentEconomyAccountSchema.nullable(),
    performance: AgentEconomyPerformanceSchema.nullable(),
    tasks: z.array(AgentTaskRecordSchema).max(100),
    events: z.array(WorkforceEventSchema).max(100),
    recentLedger: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            type: z.string(),
            amount: z.number(),
            reasonCode: z.string(),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100),
    memoryAccess: z
      .object({
        privateScope: z.string(),
        departmentScope: z.string(),
        organizationScope: z.string(),
        ownerPrivateIncluded: z.literal(false),
      })
      .strict(),
    authority: z
      .object({
        hierarchyGrantsPermissions: z.literal(false),
        creditsGrantAuthority: z.literal(false),
        capabilitiesExplicitOnly: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const WorkforceSearchQuerySchema = z
  .object({
    q: z.string().trim().max(160).default(""),
    departmentId: z.string().uuid().optional(),
    status: z.enum(["ACTIVE", "DORMANT", "BLOCKED", "SUSPENDED", "FAILED"]).optional(),
    source: z.enum(["ALEXA_NATIVE", "EVERYTHING_CLAUDE_CODE"]).optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(500),
  })
  .strict();

export const UpdateWorkforceActivationRequestSchema = z
  .object({ state: z.enum(["ACTIVE", "DORMANT"]) })
  .strict();

export type WorkforceEvent = z.infer<typeof WorkforceEventSchema>;
export type WorkforceImportReport = z.infer<typeof WorkforceImportReportSchema>;
export type WorkforceGraphResponse = z.infer<typeof WorkforceGraphResponseSchema>;
export type WorkforceAgentDetail = z.infer<typeof WorkforceAgentDetailSchema>;
export type DepartmentTemplate = z.infer<typeof DepartmentTemplateSchema>;
export type CreateWorkforceDepartmentRequest = z.infer<
  typeof CreateWorkforceDepartmentRequestSchema
>;
export type UpdateWorkforceDepartmentRequest = z.infer<
  typeof UpdateWorkforceDepartmentRequestSchema
>;
