import { z } from "zod";

export const BusinessProviderSchema = z.enum(["gmail", "crm", "analytics", "github"]);
export const BusinessCapabilitySchema = z.enum([
  "email.search", "email.read_thread", "email.create_draft", "email.send_draft",
  "crm.search_leads", "crm.read_lead", "crm.create_lead", "crm.update_stage", "crm.add_note",
  "analytics.read_metric", "github.read_issue", "github.create_issue", "github.read_pull_request",
]);
export const BusinessExecutionStatusSchema = z.enum([
  "WAITING_APPROVAL", "QUEUED", "EXECUTING", "VERIFIED", "DENIED", "FAILED",
  "EXTERNAL_RESULT_UNCERTAIN", "REVIEW_REQUIRED", "CANCELLED",
]);
export const BusinessAttributionTypeSchema = z.enum([
  "DIRECT", "WORKFLOW_DERIVED", "EXPERIMENT_ASSIGNED", "ASSISTED", "CORRELATED", "UNKNOWN",
]);
export const AttributionConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const ReferencesSchema = z.object({
  organizationId: z.string().uuid().nullable().default(null),
  objectiveId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  workflowRunId: z.string().uuid().nullable().default(null),
  taskId: z.string().min(1).max(160).nullable().default(null),
  experimentId: z.string().uuid().nullable().default(null),
  variantId: z.string().uuid().nullable().default(null),
  agentId: z.string().min(1).max(160).nullable().default(null),
}).strict();

const actionBase = {
  idempotencyKey: z.string().min(8).max(200),
  reason: z.string().trim().min(1).max(500),
  references: ReferencesSchema.default({ organizationId:null, objectiveId:null, projectId:null, workflowRunId:null, taskId:null, experimentId:null, variantId:null, agentId:null }),
};
const emailAddress = z.string().email().max(320);
const safeId = z.string().trim().min(1).max(200);
const safeText = z.string().trim().min(1).max(10_000);

export const BusinessActionRequestSchema = z.discriminatedUnion("capability", [
  z.object({ ...actionBase, capability: z.literal("email.search"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.read_thread"), threadId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.create_draft"), to: z.array(emailAddress).min(1).max(20), cc: z.array(emailAddress).max(20).default([]), subject: z.string().trim().min(1).max(300), body: safeText, threadId: safeId.nullable().default(null) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.send_draft"), draftId: safeId, recipientCount: z.number().int().min(1).max(50) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.search_leads"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.read_lead"), externalLeadId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.create_lead"), internalEntityId: safeId, displayName: z.string().trim().min(1).max(200), email: emailAddress.nullable().default(null), company: z.string().trim().max(200).nullable().default(null) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.update_stage"), externalLeadId: safeId, expectedVersion: z.string().max(100).nullable().default(null), stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "CLOSED_LOST"]) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.add_note"), externalLeadId: safeId, note: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("analytics.read_metric"), metricId: z.string().regex(/^[a-zA-Z0-9_.-]{2,120}$/), windowStart: z.iso.datetime(), windowEnd: z.iso.datetime(), filters: z.record(z.string().max(80), z.string().max(200)).default({}) }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.read_issue"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), issueNumber: z.number().int().positive() }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.create_issue"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), title: z.string().trim().min(1).max(256), body: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.read_pull_request"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), pullRequestNumber: z.number().int().positive() }).strict(),
]);

export const BusinessExecutionRecordSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), provider: BusinessProviderSchema,
  integrationId: z.string().min(3).max(120), capability: BusinessCapabilitySchema,
  idempotencyKey: z.string().min(8).max(200), actionDigest: z.string().regex(/^[a-f0-9]{64}$/), status: BusinessExecutionStatusSchema,
  approvalId: z.string().uuid().nullable(), externalReferenceId: z.string().max(300).nullable(),
  actionSummary: z.string().min(1).max(500), resultSummary: z.string().min(1).max(1_000),
  references: ReferencesSchema, verification: z.enum(["NOT_REQUIRED", "PENDING", "VERIFIED", "FAILED", "UNCERTAIN"]),
  attemptCount: z.number().int().min(0).max(10), requestedAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();

export const BusinessExternalEventInputSchema = z.object({
  integrationId: z.string().min(3).max(120), externalEventId: safeId,
  type: z.enum(["EMAIL_REPLIED", "EMAIL_DELIVERED", "CRM_LEAD_STAGE_CHANGED", "ANALYTICS_METRIC_OBSERVED", "GITHUB_ISSUE_CHANGED"]),
  occurredAt: z.iso.datetime(), entityRef: safeId.nullable().default(null), payloadRef: safeId.nullable().default(null),
  objectiveId: z.string().uuid().nullable().default(null), experimentId: z.string().uuid().nullable().default(null),
  variantId: z.string().uuid().nullable().default(null), metricId: z.string().max(120).nullable().default(null),
  metricValue: z.number().finite().nullable().default(null), metricUnit: z.string().max(40).nullable().default(null),
  sourceVersion: z.string().max(100).nullable().default(null),
}).strict();

export const BusinessExternalEventSchema = BusinessExternalEventInputSchema.extend({
  id: z.string().uuid(), ownerId: z.string().uuid(), provider: BusinessProviderSchema,
  signatureVerified: z.literal(true), receivedAt: z.iso.datetime(), processedAt: z.iso.datetime().nullable(),
  processingStatus: z.enum(["RECEIVED", "PROCESSED", "DUPLICATE", "FAILED"]),
}).strict();

export const ExternalMetricObservationSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), objectiveId: z.string().uuid().nullable(),
  experimentId: z.string().uuid().nullable(), variantId: z.string().uuid().nullable(), metricId: z.string().min(1).max(120),
  sourceProvider: BusinessProviderSchema, externalMetricId: z.string().max(200).nullable(), value: z.number().finite(),
  unit: z.string().min(1).max(40), observedAt: z.iso.datetime(), fetchedAt: z.iso.datetime(),
  sourceHealth: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "REAUTH_REQUIRED"]), evidenceRef: z.string().max(300).nullable(),
}).strict();

export const OutcomeAttributionSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), externalOutcomeId: z.string().max(200).nullable(),
  objectiveId: z.string().uuid().nullable(), projectId: z.string().uuid().nullable(), workflowRunId: z.string().uuid().nullable(),
  taskId: z.string().max(160).nullable(), experimentId: z.string().uuid().nullable(), variantId: z.string().uuid().nullable(),
  agentContributions: z.array(z.object({ agentId: z.string().min(1).max(160), weight: z.number().min(0).max(1) }).strict()).max(25),
  attributionType: BusinessAttributionTypeSchema, confidence: AttributionConfidenceSchema,
  evidenceRefs: z.array(z.string().min(1).max(300)).max(50), outcomeType: z.string().min(1).max(120),
  numericValue: z.number().finite().nullable(), unit: z.string().max(40).nullable(), createdAt: z.iso.datetime(),
}).strict().superRefine((value, context) => {
  const total = value.agentContributions.reduce((sum, item) => sum + item.weight, 0);
  if (total > 1.000001) context.addIssue({ code: "custom", path: ["agentContributions"], message: "Contribution weights must not exceed one." });
});

export const BusinessEntityMappingSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), integrationId: z.string().min(3).max(120),
  entityType: z.enum(["LEAD", "CONTACT", "EMAIL_THREAD", "ISSUE"]), externalId: safeId,
  internalEntityId: safeId, externalVersion: z.string().max(100).nullable(), lastSyncedAt: z.iso.datetime(),
  conflictPolicy: z.enum(["REMOTE_WINS", "LOCAL_WINS", "MERGE", "REVIEW_REQUIRED"]),
}).strict();

export const IntegrationSyncCheckpointSchema = z.object({
  ownerId: z.string().uuid(), integrationId: z.string().min(3).max(120), stream: z.string().min(1).max(120),
  cursor: z.string().max(500), sourceTimestamp: z.iso.datetime().nullable(), updatedAt: z.iso.datetime(),
}).strict();

export const BusinessOperationsDashboardSchema = z.object({
  executions: z.array(BusinessExecutionRecordSchema).max(500), events: z.array(BusinessExternalEventSchema).max(500),
  metrics: z.array(ExternalMetricObservationSchema).max(500), attributions: z.array(OutcomeAttributionSchema).max(500),
  mappings: z.array(BusinessEntityMappingSchema).max(500), checkpoints: z.array(IntegrationSyncCheckpointSchema).max(100),
  summary: z.object({ verifiedActions: z.number().int().nonnegative(), waitingApproval: z.number().int().nonnegative(), uncertainActions: z.number().int().nonnegative(), verifiedOutcomes: z.number().int().nonnegative() }).strict(),
}).strict();

export type BusinessProvider = z.infer<typeof BusinessProviderSchema>;
export type BusinessCapability = z.infer<typeof BusinessCapabilitySchema>;
export type BusinessActionRequest = z.infer<typeof BusinessActionRequestSchema>;
export type BusinessExecutionRecord = z.infer<typeof BusinessExecutionRecordSchema>;
export type BusinessExternalEvent = z.infer<typeof BusinessExternalEventSchema>;
export type BusinessExternalEventInput = z.infer<typeof BusinessExternalEventInputSchema>;
export type ExternalMetricObservation = z.infer<typeof ExternalMetricObservationSchema>;
export type OutcomeAttribution = z.infer<typeof OutcomeAttributionSchema>;
export type BusinessEntityMapping = z.infer<typeof BusinessEntityMappingSchema>;
export type IntegrationSyncCheckpoint = z.infer<typeof IntegrationSyncCheckpointSchema>;
