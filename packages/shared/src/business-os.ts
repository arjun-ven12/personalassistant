import { z } from "zod";

const boundedId = z.string().min(1).max(200);
const entityRef = z
  .object({
    kind: z.enum([
      "OBJECTIVE",
      "PROJECT",
      "WORKFLOW",
      "TASK",
      "AGENT",
      "CAPABILITY",
      "EXTERNAL_ACTION",
      "OUTCOME",
      "EXPERIMENT",
      "APPROVAL",
      "PROVIDER",
    ]),
    id: boundedId,
    label: z.string().min(1).max(300),
    status: z.string().max(80).nullable(),
    route: z.string().max(500).nullable(),
  })
  .strict();

export const BusinessAttentionTypeSchema = z.enum([
  "APPROVAL_REQUIRED",
  "OBJECTIVE_AT_RISK",
  "OBJECTIVE_BLOCKED",
  "BUDGET_AT_RISK",
  "DEADLINE_AT_RISK",
  "CAPABILITY_REQUIRED",
  "PROVIDER_REAUTH_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "EXPERIMENT_GUARDRAIL",
  "WORKFLOW_STUCK",
  "TASK_STUCK",
  "EXTERNAL_RESULT_UNCERTAIN",
  "RECONCILIATION_REQUIRED",
]);

export const BusinessAttentionItemSchema = z
  .object({
    id: boundedId,
    type: BusinessAttentionTypeSchema,
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    handling: z.enum(["OWNER_ACTION_REQUIRED", "SYSTEM_HANDLING"]),
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(600),
    why: z.array(z.string().min(1).max(300)).max(12),
    currentResponse: z.string().min(1).max(300),
    ownerAction: z.string().min(1).max(300),
    entity: entityRef,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const BusinessTimelineEventSchema = z
  .object({
    id: boundedId,
    category: z.enum([
      "OBJECTIVE",
      "WORKFLOW",
      "TASK",
      "AGENT",
      "EXPERIMENT",
      "ECONOMY",
      "APPROVAL",
      "EXTERNAL",
      "SYSTEM",
    ]),
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(600),
    occurredAt: z.iso.datetime(),
    entity: entityRef.nullable(),
  })
  .strict();

export const ExecutionChainSchema = z
  .object({
    id: boundedId,
    nodes: z.array(entityRef).min(1).max(12),
  })
  .strict();

export const BusinessExplanationSchema = z
  .object({
    entity: entityRef,
    heading: z.string().min(1).max(200),
    evidence: z
      .array(
        z
          .object({
            label: z.string().min(1).max(120),
            value: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(16),
    conclusion: z.string().min(1).max(500),
  })
  .strict();

export const ProviderImpactSchema = z
  .object({
    provider: z.enum(["gmail", "crm", "analytics", "github"]),
    health: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "REAUTH_REQUIRED"]),
    activeObjectives: z.number().int().nonnegative(),
    workflowRuns: z.number().int().nonnegative(),
    queuedTasks: z.number().int().nonnegative(),
    experiments: z.number().int().nonnegative(),
    explanation: z.string().min(1).max(500),
  })
  .strict();

export const BusinessCapabilitySummarySchema = z
  .object({
    id: boundedId,
    name: z.string().min(1).max(160),
    state: z.enum(["AVAILABLE", "APPROVAL_REQUIRED", "UNAVAILABLE"]),
    usedByObjectives: z.number().int().nonnegative(),
    usedByWorkflows: z.number().int().nonnegative(),
    usedByAgents: z.number().int().nonnegative(),
    queuedActions: z.number().int().nonnegative(),
  })
  .strict();

export const BusinessOSExecutiveSummarySchema = z
  .object({
    generatedAt: z.iso.datetime(),
    summary: z
      .object({
        activeObjectives: z.number().int().nonnegative(),
        atRiskObjectives: z.number().int().nonnegative(),
        blockedObjectives: z.number().int().nonnegative(),
        activeAgents: z.number().int().nonnegative(),
        pendingApprovals: z.number().int().nonnegative(),
        availableCredits: z.number().int().nonnegative(),
        reservedCredits: z.number().int().nonnegative(),
        verifiedOutcomes: z.number().int().nonnegative(),
        attentionCount: z.number().int().nonnegative(),
        criticalAlerts: z.number().int().nonnegative(),
      })
      .strict(),
    attention: z.array(BusinessAttentionItemSchema).max(200),
    timeline: z.array(BusinessTimelineEventSchema).max(200),
    executionChains: z.array(ExecutionChainSchema).max(200),
    explanations: z.array(BusinessExplanationSchema).max(200),
    providerImpact: z.array(ProviderImpactSchema).max(20),
    capabilities: z.array(BusinessCapabilitySummarySchema).max(500),
    invariants: z
      .object({
        deterministicAttention: z.literal(true),
        ownerScoped: z.literal(true),
        secretsExcluded: z.literal(true),
        chainOfThoughtExcluded: z.literal(true),
        authorityNarrowingRequired: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type BusinessOSExecutiveSummary = z.infer<
  typeof BusinessOSExecutiveSummarySchema
>;
export type BusinessAttentionItem = z.infer<typeof BusinessAttentionItemSchema>;
export type ExecutionChain = z.infer<typeof ExecutionChainSchema>;
