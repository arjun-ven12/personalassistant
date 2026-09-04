import {
  BusinessOSExecutiveSummarySchema,
  type BusinessAttentionItem,
  type BusinessOSExecutiveSummary,
} from "@alexa-control/shared";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { ApprovalService } from "../governance/approval-service.js";
import type { IntegrationRegistryService } from "../integrations/service.js";
import type { ObjectiveEngineService } from "../objectives/service.js";
import type { ExperimentService } from "../experiments/service.js";
import type { WorkforceRuntimeService } from "../workforce-runtime/service.js";
import type { CrossApplicationWorkflowService } from "../cross-application-workflows/service.js";

const ACTIVE_OBJECTIVES = new Set(["ACTIVE", "AT_RISK", "BLOCKED"]);
const OPEN_TASKS = new Set([
  "CREATED",
  "QUEUED",
  "MATCHING",
  "ASSIGNED",
  "RESERVED",
  "RUNNING",
  "WAITING",
  "REVIEW_REQUIRED",
  "RECOVERY_REVIEW_REQUIRED",
]);
const RUNNING_WORKFLOWS = new Set([
  "ready",
  "running",
  "waiting",
  "waiting_approval",
  "paused",
  "recovering",
]);
const STUCK_AFTER_MS = 30 * 60 * 1_000;

const route = (path: string, id?: string | null) =>
  id ? `${path}?selected=${encodeURIComponent(id)}` : path;
const ageMs = (now: Date, value: string) =>
  Math.max(0, now.getTime() - new Date(value).getTime());
const uniqueRefs = (values: Array<string | null | undefined>) =>
  new Set(values.filter((value): value is string => Boolean(value))).size;

export class BusinessOSService {
  constructor(
    private readonly objectives: ObjectiveEngineService,
    private readonly workforce: WorkforceRuntimeService,
    private readonly economy: AgentEconomyService,
    private readonly experiments: ExperimentService,
    private readonly integrations: IntegrationRegistryService,
    private readonly approvals: ApprovalService,
    private readonly workflows: CrossApplicationWorkflowService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summary(ownerId: string): Promise<BusinessOSExecutiveSummary> {
    const [
      objectiveData,
      workforceData,
      economyData,
      experimentData,
      integrationData,
      businessData,
      pendingApprovals,
      workflowData,
    ] = await Promise.all([
      this.objectives.dashboard(ownerId),
      this.workforce.dashboard(ownerId),
      this.economy.dashboard(ownerId),
      this.experiments.dashboard(ownerId),
      this.integrations.dashboard(ownerId),
      this.integrations.businessDashboard(ownerId),
      this.approvals.list(ownerId, "PENDING"),
      this.workflows.dashboard(ownerId),
    ]);
    const now = this.now();
    const goals = new Map(objectiveData.goals.map((goal) => [goal.id, goal]));
    const projects = new Map(
      objectiveData.projects.map((project) => [project.id, project]),
    );
    const tasks = new Map(workforceData.tasks.map((task) => [task.id, task]));
    const objectiveTitle = (id: string | null) => {
      const objective = objectiveData.objectives.find((item) => item.id === id);
      return objective
        ? (goals.get(objective.executiveGoalId)?.title ?? "Objective")
        : "Objective";
    };
    const attention: BusinessAttentionItem[] = [];
    for (const approval of pendingApprovals)
      attention.push({
        id: `approval:${approval.id}`,
        type: "APPROVAL_REQUIRED",
        severity: approval.riskLevel === "high" ? "HIGH" : "MEDIUM",
        handling: "OWNER_ACTION_REQUIRED",
        title: approval.humanSummary,
        summary: "A governed action is waiting for an owner decision.",
        why: [
          `Risk: ${approval.riskLevel}`,
          `Approval: ${approval.approvalRequirement}`,
        ],
        currentResponse: "Execution remains paused.",
        ownerAction: "Review the exact action and approve or reject it.",
        entity: {
          kind: "APPROVAL",
          id: approval.id,
          label: approval.humanSummary,
          status: approval.status,
          route: "/approvals",
        },
        createdAt: approval.requestedAt,
      });
    for (const objective of objectiveData.objectives) {
      const title = goals.get(objective.executiveGoalId)?.title ?? "Objective";
      const base = {
        kind: "OBJECTIVE" as const,
        id: objective.id,
        label: title,
        status: objective.status,
        route: route("/objectives", objective.id),
      };
      if (objective.status === "AT_RISK")
        attention.push({
          id: `objective-risk:${objective.id}`,
          type: "OBJECTIVE_AT_RISK",
          severity: "HIGH",
          handling: "SYSTEM_HANDLING",
          title,
          summary: objective.riskReasons[0] ?? "The objective forecast is at risk.",
          why: objective.riskReasons.length
            ? objective.riskReasons
            : ["Progress is behind its bounded forecast."],
          currentResponse: objective.lastReplanTrigger
            ? `Strategy version ${objective.strategyVersion} reflects ${objective.lastReplanTrigger}.`
            : "Monitoring progress and bounded recovery options.",
          ownerAction: "None unless Athena requests a decision.",
          entity: base,
          createdAt: objective.updatedAt,
        });
      if (objective.status === "BLOCKED")
        attention.push({
          id: `objective-blocked:${objective.id}`,
          type: "OBJECTIVE_BLOCKED",
          severity: "HIGH",
          handling: "OWNER_ACTION_REQUIRED",
          title,
          summary: objective.blockers[0] ?? "The objective cannot continue.",
          why: objective.blockers.length
            ? objective.blockers
            : ["A required dependency is unavailable."],
          currentResponse:
            "Unaffected branches may continue; the blocked branch is paused.",
          ownerAction: "Resolve the listed capability, approval, or constraint.",
          entity: base,
          createdAt: objective.updatedAt,
        });
      if (objective.budgetStatus === "BUDGET_AT_RISK")
        attention.push({
          id: `objective-budget:${objective.id}`,
          type: "BUDGET_AT_RISK",
          severity: "HIGH",
          handling: "SYSTEM_HANDLING",
          title,
          summary: `Projected cost ${objective.projectedCost} exceeds or approaches the ${objective.budgetCredits} credit budget.`,
          why: [
            `${objective.spentCredits} spent`,
            `${objective.committedCredits} committed`,
          ],
          currentResponse:
            "Evaluating cheaper eligible work and pausing optional branches.",
          ownerAction: "None unless additional allocation is requested.",
          entity: base,
          createdAt: objective.updatedAt,
        });
      if (
        objective.deadlineStatus === "AT_RISK" ||
        objective.deadlineStatus === "OVERDUE"
      )
        attention.push({
          id: `objective-deadline:${objective.id}`,
          type: "DEADLINE_AT_RISK",
          severity: objective.deadlineStatus === "OVERDUE" ? "HIGH" : "MEDIUM",
          handling: "SYSTEM_HANDLING",
          title,
          summary:
            objective.deadlineStatus === "OVERDUE"
              ? "The objective deadline has passed."
              : "The objective may miss its deadline.",
          why: objective.riskReasons.length
            ? objective.riskReasons
            : [`Deadline state: ${objective.deadlineStatus}`],
          currentResponse: "Evaluating safe parallelism and eligible alternatives.",
          ownerAction: "None unless a deadline or scope decision is requested.",
          entity: base,
          createdAt: objective.updatedAt,
        });
    }
    for (const link of objectiveData.capabilityRequests.filter(
      (item) => item.status !== "RESOLVED",
    ))
      attention.push({
        id: `capability:${link.id}`,
        type: "CAPABILITY_REQUIRED",
        severity: "HIGH",
        handling: "OWNER_ACTION_REQUIRED",
        title: objectiveTitle(link.objectiveExecutionId),
        summary: `${link.requiredCapability} is required by an affected branch.`,
        why: [`Capability request: ${link.status}`],
        currentResponse: "The affected branch is blocked; unrelated work may continue.",
        ownerAction: "Review the linked Capability Studio request.",
        entity: {
          kind: "CAPABILITY",
          id: link.capabilityRequestId,
          label: link.requiredCapability,
          status: link.status,
          route: "/capabilities",
        },
        createdAt: now.toISOString(),
      });
    for (const task of workforceData.tasks.filter(
      (item) =>
        OPEN_TASKS.has(item.status) && ageMs(now, item.updatedAt) > STUCK_AFTER_MS,
    ))
      attention.push({
        id: `task-stuck:${task.id}`,
        type: "TASK_STUCK",
        severity: "MEDIUM",
        handling: "SYSTEM_HANDLING",
        title: task.title,
        summary: `No task progress for ${Math.floor(ageMs(now, task.updatedAt) / 60_000)} minutes.`,
        why: [
          `State: ${task.status}`,
          `Retry ${task.retryCount} of ${task.maxRetries}`,
        ],
        currentResponse:
          task.status === "RECOVERY_REVIEW_REQUIRED"
            ? "Recovery requires a bounded review."
            : "Checking lease, dependency, and retry state.",
        ownerAction:
          task.status === "RECOVERY_REVIEW_REQUIRED"
            ? "Inspect the recovery record."
            : "None while bounded recovery is active.",
        entity: {
          kind: "TASK",
          id: task.id,
          label: task.title,
          status: task.status,
          route: route("/agents", task.id),
        },
        createdAt: task.updatedAt,
      });
    for (const graph of workflowData.graphs.filter(
      (item) =>
        RUNNING_WORKFLOWS.has(item.status) &&
        ageMs(now, item.updatedAt) > STUCK_AFTER_MS,
    ))
      attention.push({
        id: `workflow-stuck:${graph.id}`,
        type: "WORKFLOW_STUCK",
        severity: "MEDIUM",
        handling: "SYSTEM_HANDLING",
        title: graph.goal,
        summary: `No workflow progress for ${Math.floor(ageMs(now, graph.updatedAt) / 60_000)} minutes.`,
        why: [`State: ${graph.status}`, `${graph.nodeCount} steps`],
        currentResponse:
          "Inspecting the current step, approval, and provider dependencies.",
        ownerAction: "None unless recovery reports a non-retryable blocker.",
        entity: {
          kind: "WORKFLOW",
          id: graph.id,
          label: graph.goal,
          status: graph.status,
          route: route("/workflows", graph.id),
        },
        createdAt: graph.updatedAt,
      });
    for (const execution of businessData.executions.filter(
      (item) => item.status === "EXTERNAL_RESULT_UNCERTAIN",
    ))
      attention.push({
        id: `reconcile:${execution.id}`,
        type: "RECONCILIATION_REQUIRED",
        severity: "HIGH",
        handling: "SYSTEM_HANDLING",
        title: execution.actionSummary,
        summary:
          "The provider may have accepted the side effect before the result became uncertain.",
        why: [execution.resultSummary, `Verification: ${execution.verification}`],
        currentResponse: "Checking provider state without replaying the action.",
        ownerAction:
          execution.status === "REVIEW_REQUIRED"
            ? "Review the external result."
            : "None while reconciliation is possible.",
        entity: {
          kind: "EXTERNAL_ACTION",
          id: execution.id,
          label: execution.actionSummary,
          status: execution.status,
          route: route("/objectives", execution.references.objectiveId),
        },
        createdAt: execution.updatedAt,
      });
    for (const item of integrationData.integrations.filter((entry) =>
      ["gmail", "crm", "analytics", "github"].includes(entry.id),
    )) {
      const health = integrationData.health.find(
        (entry) => entry.integrationId === item.id,
      );
      if (
        health?.credentialStatus === "expired" ||
        health?.credentialStatus === "revoked"
      )
        attention.push({
          id: `provider-auth:${item.id}`,
          type: "PROVIDER_REAUTH_REQUIRED",
          severity: "HIGH",
          handling: "OWNER_ACTION_REQUIRED",
          title: item.displayName,
          summary: "The provider connection requires owner reauthentication.",
          why: [health.reasonCode],
          currentResponse: "New provider actions and synchronization are blocked.",
          ownerAction: `Reconnect ${item.displayName}.`,
          entity: {
            kind: "PROVIDER",
            id: item.id,
            label: item.displayName,
            status: "REAUTH_REQUIRED",
            route: "/applications",
          },
          createdAt: health.checkedAt,
        });
      else if (health && ["unhealthy", "unknown"].includes(health.state))
        attention.push({
          id: `provider-down:${item.id}`,
          type: "PROVIDER_UNAVAILABLE",
          severity: "HIGH",
          handling: "SYSTEM_HANDLING",
          title: item.displayName,
          summary: "The provider is unavailable.",
          why: [health.reasonCode],
          currentResponse:
            "Provider-dependent work is paused and bounded retries are active where safe.",
          ownerAction: "None unless the outage persists or credentials are requested.",
          entity: {
            kind: "PROVIDER",
            id: item.id,
            label: item.displayName,
            status: "UNAVAILABLE",
            route: "/applications",
          },
          createdAt: health.checkedAt,
        });
    }
    for (const event of experimentData.timeline.filter(
      (item) => item.type === "GUARDRAIL_BREACHED",
    )) {
      const experiment = experimentData.experiments.find(
        (item) => item.id === event.experimentId,
      );
      attention.push({
        id: `experiment-guardrail:${event.id}`,
        type: "EXPERIMENT_GUARDRAIL",
        severity: "HIGH",
        handling: "SYSTEM_HANDLING",
        title: experiment?.title ?? "Experiment guardrail",
        summary: event.summary,
        why: ["A configured guardrail was breached."],
        currentResponse:
          "The affected variant is paused or stopped and cannot be declared the winner.",
        ownerAction: "Review only if a strategy change is desired.",
        entity: {
          kind: "EXPERIMENT",
          id: event.experimentId,
          label: experiment?.title ?? "Experiment",
          status: experiment?.status ?? null,
          route: route("/objectives", experiment?.objectiveId),
        },
        createdAt: event.createdAt,
      });
    }

    const executionChains = businessData.executions
      .slice(0, 200)
      .map((execution) => {
        const refs = execution.references;
        const nodes = [];
        if (refs.objectiveId)
          nodes.push({
            kind: "OBJECTIVE" as const,
            id: refs.objectiveId,
            label: objectiveTitle(refs.objectiveId),
            status:
              objectiveData.objectives.find((item) => item.id === refs.objectiveId)
                ?.status ?? null,
            route: route("/objectives", refs.objectiveId),
          });
        if (refs.projectId)
          nodes.push({
            kind: "PROJECT" as const,
            id: refs.projectId,
            label: projects.get(refs.projectId)?.title ?? "Project",
            status: projects.get(refs.projectId)?.status ?? null,
            route: route("/objectives", refs.objectiveId),
          });
        if (refs.workflowRunId)
          nodes.push({
            kind: "WORKFLOW" as const,
            id: refs.workflowRunId,
            label:
              workflowData.graphs.find((item) => item.id === refs.workflowRunId)
                ?.goal ?? "Workflow",
            status:
              workflowData.graphs.find((item) => item.id === refs.workflowRunId)
                ?.status ?? null,
            route: route("/workflows", refs.workflowRunId),
          });
        if (refs.taskId)
          nodes.push({
            kind: "TASK" as const,
            id: refs.taskId,
            label: tasks.get(refs.taskId)?.title ?? "Task",
            status: tasks.get(refs.taskId)?.status ?? null,
            route: "/agents",
          });
        if (refs.agentId)
          nodes.push({
            kind: "AGENT" as const,
            id: refs.agentId,
            label: refs.agentId,
            status: null,
            route: `/agents?view=workforce&selected=${encodeURIComponent(refs.agentId)}`,
          });
        nodes.push(
          {
            kind: "CAPABILITY" as const,
            id: execution.capability,
            label: execution.capability,
            status: null,
            route: "/applications",
          },
          {
            kind: "EXTERNAL_ACTION" as const,
            id: execution.id,
            label: execution.actionSummary,
            status: execution.status,
            route: route("/objectives", refs.objectiveId),
          },
        );
        const outcome = businessData.attributions.find(
          (item) =>
            item.taskId === refs.taskId && item.objectiveId === refs.objectiveId,
        );
        if (outcome)
          nodes.push({
            kind: "OUTCOME" as const,
            id: outcome.id,
            label: outcome.outcomeType,
            status: outcome.confidence,
            route: route("/objectives", refs.objectiveId),
          });
        return { id: `chain:${execution.id}`, nodes };
      })
      .filter((chain) => chain.nodes.length > 1);
    const providerImpact = (["gmail", "crm", "analytics", "github"] as const).map(
      (provider) => {
        const executions = businessData.executions.filter(
          (item) => item.provider === provider,
        );
        const health = integrationData.health.find(
          (item) => item.integrationId === provider,
        );
        const normalized =
          health?.credentialStatus === "expired" ||
          health?.credentialStatus === "revoked"
            ? "REAUTH_REQUIRED"
            : health?.state === "healthy"
              ? "HEALTHY"
              : health?.state === "degraded"
                ? "DEGRADED"
                : "UNAVAILABLE";
        return {
          provider,
          health: normalized,
          activeObjectives: uniqueRefs(
            executions.map((item) =>
              ACTIVE_OBJECTIVES.has(
                objectiveData.objectives.find(
                  (objective) => objective.id === item.references.objectiveId,
                )?.status ?? "",
              )
                ? item.references.objectiveId
                : null,
            ),
          ),
          workflowRuns: uniqueRefs(
            executions.map((item) => item.references.workflowRunId),
          ),
          queuedTasks: uniqueRefs(
            executions
              .filter((item) => ["WAITING_APPROVAL", "QUEUED"].includes(item.status))
              .map((item) => item.references.taskId),
          ),
          experiments: uniqueRefs(
            executions.map((item) => item.references.experimentId),
          ),
          explanation:
            normalized === "HEALTHY"
              ? "Provider-dependent work is available."
              : "Only work that depends on this provider is affected.",
        };
      },
    );
    const permissionByCapability = new Map(
      integrationData.permissions.map((item) => [item.capabilityId, item]),
    );
    const capabilities = integrationData.capabilities.map((capability) => {
      const permission = permissionByCapability.get(capability.id);
      const used = businessData.executions.filter(
        (item) =>
          item.integrationId === capability.integrationId &&
          capability.operations.some((operation) =>
            operation.includes(item.capability.split(".").at(-1) ?? ""),
          ),
      );
      return {
        id: capability.id,
        name: capability.name,
        state:
          !capability.enabled || permission?.state !== "granted"
            ? ("UNAVAILABLE" as const)
            : capability.approvalRequired
              ? ("APPROVAL_REQUIRED" as const)
              : ("AVAILABLE" as const),
        usedByObjectives: uniqueRefs(used.map((item) => item.references.objectiveId)),
        usedByWorkflows: uniqueRefs(used.map((item) => item.references.workflowRunId)),
        usedByAgents: uniqueRefs(used.map((item) => item.references.agentId)),
        queuedActions: used.filter((item) =>
          ["WAITING_APPROVAL", "QUEUED"].includes(item.status),
        ).length,
      };
    });
    const explanations = [
      ...objectiveData.objectives
        .filter((item) => ["AT_RISK", "BLOCKED"].includes(item.status))
        .map((item) => ({
          entity: {
            kind: "OBJECTIVE" as const,
            id: item.id,
            label: objectiveTitle(item.id),
            status: item.status,
            route: route("/objectives", item.id),
          },
          heading: "Why this objective needs attention",
          evidence: [
            { label: "Execution", value: `${item.executionProgress}%` },
            { label: "Outcome", value: `${item.outcomeProgress}%` },
            {
              label: "Budget",
              value: `${item.spentCredits} / ${item.budgetCredits} credits`,
            },
            { label: "Deadline", value: item.deadlineStatus },
            {
              label: "Primary blocker",
              value:
                item.blockers[0] ?? item.riskReasons[0] ?? "No single blocker recorded",
            },
          ],
          conclusion:
            item.riskReasons[0] ??
            item.blockers[0] ??
            "Structured monitoring identified an operational risk.",
        })),
      ...workforceData.tasks
        .filter((item) => item.assignedAgentId && item.selection.length)
        .slice(0, 50)
        .map((task) => {
          const score =
            task.selection.find((item) => item.agentId === task.assignedAgentId) ??
            task.selection[0]!;
          return {
            entity: {
              kind: "AGENT" as const,
              id: score.agentId,
              label: score.agentId,
              status: task.status,
              route: `/agents?view=workforce&selected=${encodeURIComponent(score.agentId)}`,
            },
            heading: "Why this agent was selected",
            evidence: [
              { label: "Skill fit", value: `${Math.round(score.skillFit * 100)}%` },
              {
                label: "Capability fit",
                value: `${Math.round(score.capabilityFit * 100)}%`,
              },
              { label: "Reputation", value: `${Math.round(score.reputation * 100)}%` },
              {
                label: "Calibration",
                value: `${Math.round(score.calibration * 100)}%`,
              },
              {
                label: "Availability",
                value: `${Math.round(score.availability * 100)}%`,
              },
              { label: "Estimated cost", value: `${score.estimatedCost} credits` },
            ],
            conclusion:
              score.reasons.join(" ") ||
              "The deterministic scheduler selected the highest eligible bounded score.",
          };
        }),
    ];
    const timeline = [
      ...objectiveData.events.map((item) => ({
        id: `objective:${item.id}`,
        category: "OBJECTIVE" as const,
        title: item.type.replaceAll("_", " "),
        summary: item.summary,
        occurredAt: item.createdAt,
        entity: {
          kind: "OBJECTIVE" as const,
          id: item.objectiveExecutionId,
          label: objectiveTitle(item.objectiveExecutionId),
          status: null,
          route: route("/objectives", item.objectiveExecutionId),
        },
      })),
      ...experimentData.timeline.map((item) => ({
        id: `experiment:${item.id}`,
        category: "EXPERIMENT" as const,
        title: item.type.replaceAll("_", " "),
        summary: item.summary,
        occurredAt: item.createdAt,
        entity: {
          kind: "EXPERIMENT" as const,
          id: item.experimentId,
          label:
            experimentData.experiments.find((value) => value.id === item.experimentId)
              ?.title ?? "Experiment",
          status: null,
          route: "/objectives",
        },
      })),
      ...businessData.executions.map((item) => ({
        id: `external:${item.id}`,
        category: "EXTERNAL" as const,
        title: item.actionSummary,
        summary: item.resultSummary,
        occurredAt: item.updatedAt,
        entity: {
          kind: "EXTERNAL_ACTION" as const,
          id: item.id,
          label: item.actionSummary,
          status: item.status,
          route: route("/objectives", item.references.objectiveId),
        },
      })),
      ...economyData.ledger.slice(0, 100).map((item) => ({
        id: `economy:${item.id}`,
        category: "ECONOMY" as const,
        title: item.type.replaceAll("_", " "),
        summary: `${item.amount} credits · ${item.reasonCode}`,
        occurredAt: item.createdAt,
        entity: {
          kind: "AGENT" as const,
          id: item.agentId,
          label: item.agentId,
          status: null,
          route: `/agents?view=workforce&selected=${encodeURIComponent(item.agentId)}`,
        },
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 200);
    const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    attention.sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.createdAt.localeCompare(a.createdAt),
    );
    const boundedAttention = attention.slice(0, 200);
    return BusinessOSExecutiveSummarySchema.parse({
      generatedAt: now.toISOString(),
      summary: {
        activeObjectives: objectiveData.summary.active,
        atRiskObjectives: objectiveData.summary.atRisk,
        blockedObjectives: objectiveData.summary.blocked,
        activeAgents: workforceData.summary.active,
        pendingApprovals: pendingApprovals.length,
        availableCredits: economyData.overview.availableCredits,
        reservedCredits: economyData.overview.reservedCredits,
        verifiedOutcomes: businessData.summary.verifiedOutcomes,
        attentionCount: attention.length,
        criticalAlerts: attention.filter(
          (item) => item.severity === "CRITICAL" || item.severity === "HIGH",
        ).length,
      },
      attention: boundedAttention,
      timeline,
      executionChains,
      explanations,
      providerImpact,
      capabilities,
      invariants: {
        deterministicAttention: true,
        ownerScoped: true,
        secretsExcluded: true,
        chainOfThoughtExcluded: true,
        authorityNarrowingRequired: true,
      },
    });
  }
}
