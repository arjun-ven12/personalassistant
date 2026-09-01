import { z } from "zod";

const credits = z.number().int().nonnegative().max(1_000_000_000);
const reference = z.string().min(1).max(160);

export const AgentEconomyStatusSchema = z.enum([
  "ECONOMY_DISABLED",
  "DORMANT",
  "ACTIVE",
  "SUSPENDED",
]);

export const AgentEconomyLedgerTypeSchema = z.enum([
  "CREDIT_GRANTED",
  "REWARD_EARNED",
  "COST_RESERVED",
  "COST_SETTLED",
  "RESERVATION_RELEASED",
  "PENALTY",
  "ADJUSTMENT",
]);

export const AgentEconomyAccountSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    availableCredits: credits,
    reservedCredits: credits,
    lifetimeEarned: credits,
    lifetimeSpent: credits,
    reputation: z.number().min(0).max(100),
    economyStatus: AgentEconomyStatusSchema,
    organizationId: reference.nullable(),
    departmentId: reference.nullable(),
    parentAgentId: reference.nullable(),
    memoryScopeId: reference.nullable(),
    capabilityProfileId: reference.nullable(),
    modelPolicyId: reference.nullable(),
    activationPolicyId: reference.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const EconomyReferenceSetSchema = z
  .object({
    taskId: reference.optional(),
    workflowId: reference.optional(),
    skillId: reference.optional(),
    providerRequestId: reference.optional(),
    experimentId: reference.optional(),
    serviceRequestId: reference.optional(),
    durableExecutionId: reference.optional(),
    companyId: reference.optional(),
    assignmentId: reference.optional(),
    costAttribution: z
      .enum(["SOURCE_PAYS", "DESTINATION_PAYS", "SHARED", "OWNER_PORTFOLIO"])
      .optional(),
  })
  .strict();

export const AgentEconomyLedgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    type: AgentEconomyLedgerTypeSchema,
    amount: credits.positive(),
    reasonCode: z.string().min(1).max(120),
    idempotencyKey: z.string().min(8).max(200),
    references: EconomyReferenceSetSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentEconomyReservationSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    amountReserved: credits.positive(),
    amountSettled: credits,
    status: z.enum(["ACTIVE", "SETTLED", "RELEASED"]),
    costType: z.enum([
      "MODEL_INFERENCE",
      "LOCAL_INFERENCE",
      "TOOL_USAGE",
      "WORKFLOW_EXECUTION",
      "SKILL_EXECUTION",
      "TASK_EXECUTION",
      "RUNTIME_ACTIVATION",
      "EXPERIMENT",
    ]),
    idempotencyKey: z.string().min(8).max(200),
    references: EconomyReferenceSetSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentEconomyPerformanceSchema = z
  .object({
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    tasksAttempted: z.number().int().nonnegative(),
    tasksCompleted: z.number().int().nonnegative(),
    verifiedSuccesses: z.number().int().nonnegative(),
    verifiedFailures: z.number().int().nonnegative(),
    totalQualityScore: z.number().nonnegative(),
    totalPredictedProbability: z.number().nonnegative(),
    totalBrierScore: z.number().nonnegative(),
    totalActualCost: credits,
    totalEquivalentOutcomeValue: credits,
    calibration: z.number().min(0).max(1),
    costEfficiency: z.number().nonnegative(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AgentEconomyOutcomeSchema = z
  .object({
    taskId: reference,
    predictedSuccessProbability: z.number().min(0).max(1),
    estimatedCost: credits,
    estimatedDurationMs: z.number().int().nonnegative().max(86_400_000),
    actualSuccess: z.boolean(),
    actualCost: credits,
    actualDurationMs: z.number().int().nonnegative().max(86_400_000),
    qualityScore: z.number().min(0).max(1),
    verificationResult: z.enum(["VERIFIED", "REJECTED", "INCONCLUSIVE"]),
    evidenceRefs: z.array(reference).max(20),
  })
  .strict();

export const AgentEconomyOverviewSchema = z
  .object({
    allocatedCredits: credits,
    availableCredits: credits,
    reservedCredits: credits,
    spentCredits: credits,
    economyEnabledAgents: z.number().int().nonnegative(),
    activeAgents: z.number().int().nonnegative(),
    dormantAgents: z.number().int().nonnegative(),
    suspendedAgents: z.number().int().nonnegative(),
    averageReputation: z.number().min(0).max(100),
    settledTasks: z.number().int().nonnegative(),
  })
  .strict();

export const AgentEconomyDashboardSchema = z
  .object({
    overview: AgentEconomyOverviewSchema,
    accounts: z.array(AgentEconomyAccountSchema).max(1_000),
    performance: z.array(AgentEconomyPerformanceSchema).max(1_000),
    ledger: z.array(AgentEconomyLedgerEntrySchema).max(500),
    registeredAgents: z.number().int().nonnegative(),
    runtimeActivationsFromRegistration: z.literal(0),
    creditsGrantAuthority: z.literal("OWNER_OR_GOVERNED_SERVICE"),
    creditsCanBuyAuthority: z.literal(false),
    creditsCanBuyReputation: z.literal(false),
  })
  .strict();

export const EnrollAgentEconomyRequestSchema = z
  .object({
    organizationId: reference.optional(),
    departmentId: reference.optional(),
    parentAgentId: reference.optional(),
    memoryScopeId: reference.optional(),
    capabilityProfileId: reference.optional(),
    modelPolicyId: reference.optional(),
    activationPolicyId: reference.optional(),
  })
  .strict();

export const AllocateAgentCreditsRequestSchema = z
  .object({
    amount: credits.positive(),
    reasonCode: z.string().min(1).max(120),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const UpdateAgentEconomyStatusRequestSchema = z
  .object({ status: AgentEconomyStatusSchema })
  .strict();

export const AgentEconomyAccountResponseSchema = z
  .object({ account: AgentEconomyAccountSchema })
  .strict();

export type AgentEconomyStatus = z.infer<typeof AgentEconomyStatusSchema>;
export type AgentEconomyAccount = z.infer<typeof AgentEconomyAccountSchema>;
export type AgentEconomyLedgerEntry = z.infer<typeof AgentEconomyLedgerEntrySchema>;
export type AgentEconomyReservation = z.infer<typeof AgentEconomyReservationSchema>;
export type AgentEconomyPerformance = z.infer<typeof AgentEconomyPerformanceSchema>;
export type AgentEconomyOutcome = z.infer<typeof AgentEconomyOutcomeSchema>;
export type EconomyReferenceSet = z.infer<typeof EconomyReferenceSetSchema>;
export type AgentEconomyDashboard = z.infer<typeof AgentEconomyDashboardSchema>;
export type EnrollAgentEconomyRequest = z.infer<typeof EnrollAgentEconomyRequestSchema>;
export type AllocateAgentCreditsRequest = z.infer<
  typeof AllocateAgentCreditsRequestSchema
>;
