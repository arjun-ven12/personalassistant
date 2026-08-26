import { describe, expect, it, vi } from "vitest";
import { BusinessOSService } from "./service.js";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OBJECTIVE = "00000000-0000-4000-8000-000000000002";
const GOAL = "00000000-0000-4000-8000-000000000003";
const TASK = "00000000-0000-4000-8000-000000000004";
const EXECUTION = "00000000-0000-4000-8000-000000000005";
const APPROVAL = "00000000-0000-4000-8000-000000000006";
const AT = "2026-08-26T00:00:00.000Z";
const STALE = "2026-08-25T22:00:00.000Z";

const objectiveDashboard = {
  summary: { total: 1, active: 0, atRisk: 1, blocked: 0, completed: 0 },
  objectives: [
    {
      id: OBJECTIVE,
      ownerId: OWNER,
      executiveGoalId: GOAL,
      organizationId: null,
      status: "AT_RISK",
      budgetCredits: 100,
      committedCredits: 70,
      spentCredits: 50,
      executionProgress: 40,
      outcomeProgress: 20,
      strategyVersion: 2,
      activationKey: "activation",
      blockers: [],
      riskReasons: ["Reply rate is below target."],
      deadlineStatus: "AT_RISK",
      budgetStatus: "BUDGET_AT_RISK",
      projectedCost: 120,
      lastReplanTrigger: "METRIC_STAGNATION",
      createdAt: STALE,
      updatedAt: AT,
      activatedAt: STALE,
      completedAt: null,
    },
  ],
  goals: [
    {
      id: GOAL,
      title: "Acquire leads",
      description: "Acquire qualified leads",
      status: "ACTIVE",
      priority: "HIGH",
      targetDate: "2026-08-27T00:00:00.000Z",
      successCriteria: ["25 leads"],
      constraints: [],
    },
  ],
  projects: [],
  metrics: [],
  plans: [],
  events: [],
  capabilityRequests: [],
  observations: [],
  invariants: {
    objectiveGrantsAuthority: false,
    creditsGrantAuthority: false,
    executionUsesWorkforceScheduler: true,
    planningUsesExecutiveBrain: true,
  },
};
const workforceDashboard = {
  summary: {
    registered: 112,
    active: 1,
    dormant: 111,
    queued: 0,
    running: 1,
    waitingReview: 0,
    completed: 0,
    failed: 0,
    maxConcurrent: 8,
  },
  tasks: [
    {
      id: TASK,
      title: "Research leads",
      status: "RUNNING",
      updatedAt: STALE,
      retryCount: 1,
      maxRetries: 2,
      assignedAgentId: "research_agent",
      selection: [
        {
          agentId: "research_agent",
          skillFit: 0.94,
          capabilityFit: 1,
          reputation: 0.91,
          calibration: 0.86,
          costEfficiency: 0.9,
          availability: 1,
          departmentFit: 1,
          capacityPenalty: 0,
          finalScore: 0.95,
          predictedSuccess: 0.9,
          estimatedCost: 12,
          estimatedDurationMs: 60_000,
          eligible: true,
          reasons: ["Best eligible score."],
        },
      ],
    },
  ],
  messages: [],
  reviews: [],
  metrics: {
    assignments: 1,
    providerCalls: 0,
    matchingLatencyMs: 4,
    peakActiveAgents: 1,
    completionRate: 0,
  },
  invariants: {
    sharedAIRouter: true,
    dedicatedModelPerAgent: false,
    hierarchyGrantsAuthority: false,
    creditsGrantAuthority: false,
    maxTaskDepth: 4,
  },
};
const economyDashboard = {
  overview: {
    allocatedCredits: 100,
    availableCredits: 50,
    reservedCredits: 10,
    spentCredits: 40,
    economyEnabledAgents: 1,
    activeAgents: 1,
    dormantAgents: 0,
    suspendedAgents: 0,
    averageReputation: 91,
    settledTasks: 0,
  },
  accounts: [],
  performance: [],
  ledger: [],
  registeredAgents: 112,
  runtimeActivationsFromRegistration: 0,
  creditsGrantAuthority: "OWNER_OR_GOVERNED_SERVICE",
  creditsCanBuyAuthority: false,
  creditsCanBuyReputation: false,
};
const experimentDashboard = {
  experiments: [],
  variants: [],
  assignments: [],
  observations: [],
  allocations: [],
  results: [],
  timeline: [],
  summary: { running: 0, paused: 0, completed: 0, budgetAllocated: 0, budgetSpent: 0 },
  invariants: {
    experimentsGrantAuthority: false,
    verifiedEvidenceOnly: true,
    objectiveBudgetConserved: true,
    existingSchedulerUsed: true,
  },
};
const integrationDashboard = {
  integrations: [{ id: "gmail", displayName: "Gmail", status: "auth_required" }],
  capabilities: [
    {
      id: "gmail.send",
      integrationId: "gmail",
      name: "Send reviewed email",
      enabled: true,
      approvalRequired: true,
      operations: ["email.send_draft"],
    },
  ],
  permissions: [{ capabilityId: "gmail.send", state: "granted" }],
  health: [
    {
      integrationId: "gmail",
      state: "degraded",
      credentialStatus: "expired",
      reasonCode: "TOKEN_EXPIRED",
      checkedAt: AT,
    },
  ],
  usage: [],
  operations: [],
};
const businessDashboard = {
  executions: [
    {
      id: EXECUTION,
      ownerId: OWNER,
      provider: "gmail",
      integrationId: "gmail",
      capability: "email.send_draft",
      idempotencyKey: "send-once",
      actionDigest: "a".repeat(64),
      status: "EXTERNAL_RESULT_UNCERTAIN",
      approvalId: APPROVAL,
      externalReferenceId: "gmail:uncertain",
      actionSummary: "Send reviewed outreach",
      resultSummary: "Provider timed out after accepting the request.",
      references: {
        organizationId: null,
        objectiveId: OBJECTIVE,
        projectId: null,
        workflowRunId: null,
        taskId: TASK,
        experimentId: null,
        variantId: null,
        agentId: "research_agent",
      },
      verification: "UNCERTAIN",
      attemptCount: 1,
      requestedAt: AT,
      updatedAt: AT,
    },
  ],
  events: [],
  metrics: [],
  attributions: [],
  mappings: [],
  checkpoints: [],
  summary: {
    verifiedActions: 0,
    waitingApproval: 0,
    uncertainActions: 1,
    verifiedOutcomes: 0,
  },
};
const approvals = [
  {
    id: APPROVAL,
    ownerId: OWNER,
    actionId: EXECUTION,
    actionDigest: "a".repeat(64),
    toolName: "business.execute_reviewed_capability",
    riskLevel: "high",
    approvalRequirement: "explicit",
    status: "PENDING",
    humanSummary: "Send reviewed outreach",
    requestedAt: AT,
    expiresAt: "2026-08-27T00:00:00.000Z",
    decidedAt: null,
    decidedBySessionId: null,
    rejectionReason: null,
  },
];
const workflowDashboard = {
  graphs: [],
  nodes: [],
  templates: [],
  variables: [],
  executionHistory: [],
  metrics: [],
  failures: [],
  recovery: [],
  checkpoints: [],
  context: [],
  crossApplicationOrchestration: true,
  deterministicComposition: true,
};

const service = (business = businessDashboard) =>
  new BusinessOSService(
    { dashboard: vi.fn().mockResolvedValue(objectiveDashboard) } as never,
    { dashboard: vi.fn().mockResolvedValue(workforceDashboard) } as never,
    { dashboard: vi.fn().mockResolvedValue(economyDashboard) } as never,
    { dashboard: vi.fn().mockResolvedValue(experimentDashboard) } as never,
    {
      dashboard: vi.fn().mockResolvedValue(integrationDashboard),
      businessDashboard: vi.fn().mockResolvedValue(business),
    } as never,
    { list: vi.fn().mockResolvedValue(approvals) } as never,
    { dashboard: vi.fn().mockResolvedValue(workflowDashboard) } as never,
    () => new Date("2026-08-26T01:00:00.000Z"),
  );

describe("BusinessOSService", () => {
  it("builds deterministic owner and system attention without replaying uncertain work", async () => {
    const result = await service().summary(OWNER);
    expect(result.attention.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "APPROVAL_REQUIRED",
        "OBJECTIVE_AT_RISK",
        "BUDGET_AT_RISK",
        "DEADLINE_AT_RISK",
        "TASK_STUCK",
        "PROVIDER_REAUTH_REQUIRED",
        "RECONCILIATION_REQUIRED",
      ]),
    );
    expect(
      result.attention.find((item) => item.type === "PROVIDER_REAUTH_REQUIRED")
        ?.handling,
    ).toBe("OWNER_ACTION_REQUIRED");
    expect(
      result.attention.find((item) => item.type === "RECONCILIATION_REQUIRED")
        ?.handling,
    ).toBe("SYSTEM_HANDLING");
    expect(
      result.attention.find((item) => item.type === "RECONCILIATION_REQUIRED")
        ?.currentResponse,
    ).toContain("without replaying");
  });

  it("links objective to task, agent, finite capability, and external action", async () => {
    const result = await service().summary(OWNER);
    const chain = result.executionChains[0]!;
    expect(chain.nodes.map((node) => node.kind)).toEqual([
      "OBJECTIVE",
      "TASK",
      "AGENT",
      "CAPABILITY",
      "EXTERNAL_ACTION",
    ]);
    expect(
      result.explanations.some(
        (item) => item.heading === "Why this agent was selected",
      ),
    ).toBe(true);
    expect(
      result.providerImpact.find((item) => item.provider === "gmail"),
    ).toMatchObject({ health: "REAUTH_REQUIRED", activeObjectives: 1, queuedTasks: 0 });
  });

  it("keeps the mobile-ready read model bounded and free of secret payload fields", async () => {
    const result = await service().summary(OWNER);
    expect(result.summary).toMatchObject({
      atRiskObjectives: 1,
      activeAgents: 1,
      pendingApprovals: 1,
      attentionCount: 7,
    });
    expect(result.invariants).toEqual({
      deterministicAttention: true,
      ownerScoped: true,
      secretsExcluded: true,
      chainOfThoughtExcluded: true,
      authorityNarrowingRequired: true,
    });
    const keys = JSON.stringify(result, (key: string, value: unknown): unknown => {
      expect(key).not.toMatch(/^(token|cookie|password|privateKey|rawPayload)$/i);
      return value;
    });
    expect(keys.length).toBeGreaterThan(0);
  });

  it("keeps a 500-event accelerated supervisory read bounded without activating dormant agents", async () => {
    const executions = Array.from({ length: 500 }, (_, index) => ({
      ...businessDashboard.executions[0]!,
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      idempotencyKey: `long-run-${index}`,
      status: "VERIFIED",
      verification: "VERIFIED",
      externalReferenceId: `gmail:${index}`,
    }));
    const result = await service({
      ...businessDashboard,
      executions,
      summary: {
        verifiedActions: 500,
        waitingApproval: 0,
        uncertainActions: 0,
        verifiedOutcomes: 0,
      },
    }).summary(OWNER);
    expect(result.executionChains).toHaveLength(200);
    expect(result.summary.activeAgents).toBe(1);
    expect(workforceDashboard.summary.dormant).toBe(111);
    expect(workforceDashboard.metrics.providerCalls).toBe(0);
    expect(result.timeline.length).toBeLessThanOrEqual(200);
  });
});
