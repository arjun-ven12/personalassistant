import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import {
  CoreAdapterIdSchema,
  CoreAdapterSemanticActionRequestSchema,
} from "./core-adapters.js";
import {
  SemanticCapabilityIdSchema,
  SemanticDomainSchema,
} from "./application-intelligence.js";
import { WorkspaceSemanticObjectTypeSchema } from "./workspace-intelligence.js";

export const CrossApplicationWorkflowStatusSchema = z.enum([
  "draft",
  "composed",
  "ready",
  "running",
  "waiting_approval",
  "paused",
  "recovering",
  "completed",
  "failed",
  "cancelled",
]);

export const CrossApplicationWorkflowNodeStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "skipped",
  "cancelled",
]);

export const WorkflowNodeKind18FSchema = z.enum([
  "semantic_capability",
  "approval_checkpoint",
  "condition",
  "wait_condition",
  "rollback",
  "compensation",
  "summary",
]);

export const WorkflowFailurePolicy18FSchema = z.enum([
  "abort",
  "retry",
  "skip_with_approval",
  "alternative_provider",
  "rollback",
  "manual_intervention",
]);

export const WorkflowRetryPolicy18FSchema = z
  .object({
    maxAttempts: z.number().int().min(0).max(5),
    backoffMs: z.number().int().nonnegative().max(60_000),
    safeToRetry: z.boolean(),
  })
  .strict();

export const CrossApplicationWorkflowGraphSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    goal: z.string().min(1).max(1_000),
    templateId: z.string().uuid().nullable(),
    status: CrossApplicationWorkflowStatusSchema,
    nodeCount: z.number().int().nonnegative().max(1_000),
    edgeCount: z.number().int().nonnegative().max(5_000),
    parallelism: z.number().int().min(1).max(20),
    deterministicComposer: z.literal(true),
    plannerApplicationSpecificLogicAvailable: z.literal(false),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(120).nullable(),
  })
  .strict();

export const CrossApplicationWorkflowNodeSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    nodeKind: WorkflowNodeKind18FSchema,
    status: CrossApplicationWorkflowNodeStatusSchema,
    label: z.string().min(1).max(180),
    semanticCapabilityId: SemanticCapabilityIdSchema.nullable(),
    semanticDomain: SemanticDomainSchema.nullable(),
    adapterId: CoreAdapterIdSchema.nullable(),
    applicationId: RegistryIdSchema.nullable(),
    dependencies: z.array(z.string().uuid()).max(50),
    expectedOutputs: z.array(z.string().min(1).max(180)).max(50),
    preconditions: z.array(z.string().min(1).max(240)).max(50),
    verificationRequirements: z.array(z.string().min(1).max(240)).max(50),
    retryPolicy: WorkflowRetryPolicy18FSchema,
    failurePolicy: WorkflowFailurePolicy18FSchema,
    estimatedDurationMs: z.number().int().nonnegative().max(86_400_000),
    approvalRequired: z.boolean(),
    actionRequest: CoreAdapterSemanticActionRequestSchema.nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    errorCode: z.string().max(120).nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CrossApplicationWorkflowTemplateSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    category: z.enum([
      "morning_startup",
      "development_session",
      "meeting_preparation",
      "daily_planning",
      "research_session",
      "release_deployment",
      "shutdown_routine",
      "custom",
    ]),
    capabilityIds: z.array(SemanticCapabilityIdSchema).max(100),
    variableKeys: z.array(z.string().min(1).max(80)).max(100),
    editable: z.literal(true),
    source: z.enum(["built_in", "demonstration", "user"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowVariable18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    key: z.string().min(1).max(80),
    value: z.json(),
    valueType: z.enum(["string", "number", "boolean", "date", "object", "array", "null"]),
    source: z.enum(["user", "context", "computed", "node_output", "template"]),
    required: z.boolean(),
    description: z.string().max(300),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowExecutionHistory18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    nodeId: z.string().uuid().nullable(),
    eventType: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    metadata: z.record(z.string().min(1).max(80), z.json()).default({}),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowMetric18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    durationMs: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    retryCount: z.number().int().nonnegative().max(1_000),
    nodeCount: z.number().int().nonnegative().max(1_000),
    applicationCount: z.number().int().nonnegative().max(500),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowFailure18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    nodeId: z.string().uuid().nullable(),
    errorCode: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    recoveryAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowRecovery18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    nodeId: z.string().uuid().nullable(),
    strategy: WorkflowFailurePolicy18FSchema,
    status: z.enum(["suggested", "approved", "running", "completed", "failed"]),
    summary: z.string().min(1).max(600),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowCheckpoint18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    nodeId: z.string().uuid(),
    status: z.enum(["open", "approved", "rejected", "expired", "cancelled"]),
    reason: z.string().min(1).max(600),
    riskLevel: z.enum(["medium", "high"]),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const WorkflowContext18FSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    graphId: z.string().uuid(),
    currentNodeId: z.string().uuid().nullable(),
    currentApplicationId: RegistryIdSchema.nullable(),
    currentAdapterId: CoreAdapterIdSchema.nullable(),
    variables: z.record(z.string().min(1).max(80), z.json()),
    selectedObjectType: WorkspaceSemanticObjectTypeSchema.nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const ComposeCrossApplicationWorkflowRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    templateId: z.string().uuid().optional(),
    variables: z.record(z.string().min(1).max(80), z.json()).default({}),
    origin: z.enum(["planner", "voice", "gesture", "agent", "dashboard", "command"]),
  })
  .strict();

export const CrossApplicationWorkflowIdRequestSchema = z
  .object({ graphId: z.string().uuid() })
  .strict();

export const CrossApplicationWorkflowDashboardResponseSchema = z
  .object({
    graphs: z.array(CrossApplicationWorkflowGraphSchema).max(500),
    nodes: z.array(CrossApplicationWorkflowNodeSchema).max(2_000),
    templates: z.array(CrossApplicationWorkflowTemplateSchema).max(500),
    variables: z.array(WorkflowVariable18FSchema).max(2_000),
    executionHistory: z.array(WorkflowExecutionHistory18FSchema).max(2_000),
    metrics: z.array(WorkflowMetric18FSchema).max(1_000),
    failures: z.array(WorkflowFailure18FSchema).max(1_000),
    recovery: z.array(WorkflowRecovery18FSchema).max(1_000),
    checkpoints: z.array(WorkflowCheckpoint18FSchema).max(1_000),
    context: z.array(WorkflowContext18FSchema).max(500),
    crossApplicationOrchestration: z.literal(true),
    deterministicComposition: z.literal(true),
  })
  .strict();

export type CrossApplicationWorkflowGraph = z.infer<
  typeof CrossApplicationWorkflowGraphSchema
>;
export type CrossApplicationWorkflowNode = z.infer<
  typeof CrossApplicationWorkflowNodeSchema
>;
export type CrossApplicationWorkflowTemplate = z.infer<
  typeof CrossApplicationWorkflowTemplateSchema
>;
export type WorkflowVariable18F = z.infer<typeof WorkflowVariable18FSchema>;
export type WorkflowExecutionHistory18F = z.infer<
  typeof WorkflowExecutionHistory18FSchema
>;
export type WorkflowMetric18F = z.infer<typeof WorkflowMetric18FSchema>;
export type WorkflowFailure18F = z.infer<typeof WorkflowFailure18FSchema>;
export type WorkflowRecovery18F = z.infer<typeof WorkflowRecovery18FSchema>;
export type WorkflowCheckpoint18F = z.infer<typeof WorkflowCheckpoint18FSchema>;
export type WorkflowContext18F = z.infer<typeof WorkflowContext18FSchema>;
export type WorkflowFailurePolicy18F = z.infer<typeof WorkflowFailurePolicy18FSchema>;
export type ComposeCrossApplicationWorkflowRequest = z.infer<
  typeof ComposeCrossApplicationWorkflowRequestSchema
>;
