import {
  ComposeCrossApplicationWorkflowRequestSchema,
  CrossApplicationWorkflowDashboardResponseSchema,
  CrossApplicationWorkflowGraphSchema,
  CrossApplicationWorkflowNodeSchema,
  CrossApplicationWorkflowTemplateSchema,
  WorkflowCheckpoint18FSchema,
  WorkflowContext18FSchema,
  WorkflowExecutionHistory18FSchema,
  WorkflowFailure18FSchema,
  WorkflowMetric18FSchema,
  WorkflowRecovery18FSchema,
  WorkflowVariable18FSchema,
  type CoreAdapterCapabilityRecord,
  type CoreAdapterId,
  type NetworkVerificationState,
  type SemanticCapabilityId,
  type WorkflowFailurePolicy18F,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { CoreAdapterService } from "../core-adapters/service.js";
import type { CrossApplicationWorkflowStore } from "./store.js";

interface WorkflowTemplateDescriptor {
  id: string;
  name: string;
  description: string;
  category:
    | "morning_startup"
    | "development_session"
    | "meeting_preparation"
    | "daily_planning"
    | "research_session"
    | "release_deployment"
    | "shutdown_routine";
  keywords: string[];
  steps: PlanStep[];
}

interface PlanStep {
  label: string;
  adapterId: CoreAdapterId;
  capabilityId: SemanticCapabilityId;
  dependsOn: number[];
  expectedOutputs: string[];
  variableOutputs: string[];
  estimatedDurationMs: number;
  failurePolicy: WorkflowFailurePolicy18F;
}

const retryPolicy = {
  maxAttempts: 1,
  backoffMs: 250,
  safeToRetry: true,
};

const builtInTemplates: WorkflowTemplateDescriptor[] = [
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000001",
    name: "Development Session",
    description: "Open the coding workspace, terminal, browser, and local dashboard.",
    category: "development_session",
    keywords: ["development", "coding", "code", "workspace", "dev"],
    steps: [
      {
        label: "Open development workspace",
        adapterId: "vscode",
        capabilityId: "CodeEditing.OpenWorkspace",
        dependsOn: [],
        expectedOutputs: ["workspace"],
        variableOutputs: ["currentWorkspace"],
        estimatedDurationMs: 2_000,
        failurePolicy: "alternative_provider",
      },
      {
        label: "Show integrated terminal",
        adapterId: "vscode",
        capabilityId: "CodeEditing.ShowTerminal",
        dependsOn: [0],
        expectedOutputs: ["terminal"],
        variableOutputs: ["currentTerminal"],
        estimatedDurationMs: 1_000,
        failurePolicy: "abort",
      },
      {
        label: "Open localhost",
        adapterId: "chrome",
        capabilityId: "Browser.OpenLocalhost",
        dependsOn: [0],
        expectedOutputs: ["browserTab"],
        variableOutputs: ["currentBrowserTab"],
        estimatedDurationMs: 2_000,
        failurePolicy: "alternative_provider",
      },
      {
        label: "Show workspace problems",
        adapterId: "vscode",
        capabilityId: "CodeEditing.ShowProblems",
        dependsOn: [0],
        expectedOutputs: ["diagnosticsPanel"],
        variableOutputs: ["currentDiagnostics"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
    ],
  },
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000002",
    name: "Meeting Preparation",
    description: "Find the meeting, create notes, open the link, and locate documents.",
    category: "meeting_preparation",
    keywords: ["meeting", "call", "prep", "prepare"],
    steps: [
      {
        label: "Find today's events",
        adapterId: "calendar",
        capabilityId: "Calendar.TodayEvents",
        dependsOn: [],
        expectedOutputs: ["event"],
        variableOutputs: ["meetingTitle"],
        estimatedDurationMs: 1_000,
        failurePolicy: "abort",
      },
      {
        label: "Create meeting note",
        adapterId: "apple_notes",
        capabilityId: "NoteTaking.CreateNote",
        dependsOn: [0],
        expectedOutputs: ["document"],
        variableOutputs: ["meetingNote"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
      {
        label: "Open meeting link",
        adapterId: "chrome",
        capabilityId: "Browser.OpenUrl",
        dependsOn: [0],
        expectedOutputs: ["browserTab"],
        variableOutputs: ["meetingTab"],
        estimatedDurationMs: 1_500,
        failurePolicy: "alternative_provider",
      },
      {
        label: "Search related files",
        adapterId: "finder",
        capabilityId: "FileManagement.SearchFiles",
        dependsOn: [0],
        expectedOutputs: ["folder"],
        variableOutputs: ["relatedFiles"],
        estimatedDurationMs: 1_500,
        failurePolicy: "skip_with_approval",
      },
    ],
  },
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000003",
    name: "Daily Planning",
    description: "Review events, reminders, and create a planning note.",
    category: "daily_planning",
    keywords: ["daily", "planning", "plan my day", "today"],
    steps: [
      {
        label: "Read today's events",
        adapterId: "calendar",
        capabilityId: "Calendar.TodayEvents",
        dependsOn: [],
        expectedOutputs: ["events"],
        variableOutputs: ["todaysEvents"],
        estimatedDurationMs: 1_000,
        failurePolicy: "abort",
      },
      {
        label: "Read today's reminders",
        adapterId: "reminders",
        capabilityId: "TaskManagement.TodayReminders",
        dependsOn: [],
        expectedOutputs: ["tasks"],
        variableOutputs: ["todaysReminders"],
        estimatedDurationMs: 1_000,
        failurePolicy: "abort",
      },
      {
        label: "Create daily plan note",
        adapterId: "apple_notes",
        capabilityId: "NoteTaking.CreateNote",
        dependsOn: [0, 1],
        expectedOutputs: ["document"],
        variableOutputs: ["dailyPlanNote"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
    ],
  },
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000004",
    name: "Research Session",
    description: "Open the browser, search bookmarks, and create research notes.",
    category: "research_session",
    keywords: ["research", "study", "investigate"],
    steps: [
      {
        label: "Open research tab",
        adapterId: "chrome",
        capabilityId: "Browser.OpenUrl",
        dependsOn: [],
        expectedOutputs: ["browserTab"],
        variableOutputs: ["researchTab"],
        estimatedDurationMs: 1_500,
        failurePolicy: "alternative_provider",
      },
      {
        label: "Search bookmarks",
        adapterId: "chrome",
        capabilityId: "Browser.SearchBookmarks",
        dependsOn: [0],
        expectedOutputs: ["bookmarks"],
        variableOutputs: ["relatedBookmarks"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
      {
        label: "Create research note",
        adapterId: "apple_notes",
        capabilityId: "NoteTaking.CreateNote",
        dependsOn: [0],
        expectedOutputs: ["document"],
        variableOutputs: ["researchNote"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
    ],
  },
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000005",
    name: "Shutdown Routine",
    description: "Review open work and close low-risk application state.",
    category: "shutdown_routine",
    keywords: ["shutdown", "finish work", "end day", "wrap up"],
    steps: [
      {
        label: "Read current code context",
        adapterId: "vscode",
        capabilityId: "CodeEditing.ReadContext",
        dependsOn: [],
        expectedOutputs: ["workspace"],
        variableOutputs: ["currentWorkspace"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
      {
        label: "Read active browser tab metadata",
        adapterId: "chrome",
        capabilityId: "Browser.ReadActiveTabMetadata",
        dependsOn: [],
        expectedOutputs: ["browserTab"],
        variableOutputs: ["currentBrowserTab"],
        estimatedDurationMs: 1_000,
        failurePolicy: "skip_with_approval",
      },
    ],
  },
  {
    id: "0f7b1bd1-f10c-4d37-96e9-18f000000006",
    name: "Release Deployment",
    description: "Review project state and pause before any approved deployment command.",
    category: "release_deployment",
    keywords: ["release", "deploy", "deployment", "ship"],
    steps: [
      {
        label: "Open repository",
        adapterId: "vscode",
        capabilityId: "CodeEditing.OpenRepository",
        dependsOn: [],
        expectedOutputs: ["repository"],
        variableOutputs: ["selectedRepository"],
        estimatedDurationMs: 2_000,
        failurePolicy: "abort",
      },
      {
        label: "Read diagnostics",
        adapterId: "vscode",
        capabilityId: "CodeEditing.ReadDiagnostics",
        dependsOn: [0],
        expectedOutputs: ["diagnostics"],
        variableOutputs: ["releaseDiagnostics"],
        estimatedDurationMs: 1_000,
        failurePolicy: "abort",
      },
      {
        label: "Execute approved release command",
        adapterId: "terminal",
        capabilityId: "Terminal.ExecuteApprovedCommand",
        dependsOn: [1],
        expectedOutputs: ["terminalSession"],
        variableOutputs: ["releaseCommand"],
        estimatedDurationMs: 5_000,
        failurePolicy: "manual_intervention",
      },
    ],
  },
];

const valueType = (value: unknown): "string" | "number" | "boolean" | "date" | "object" | "array" | "null" => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
};

export class CrossApplicationWorkflowService {
  constructor(
    readonly store: CrossApplicationWorkflowStore,
    readonly coreAdapters: CoreAdapterService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBuiltInTemplates(ownerId);
    return CrossApplicationWorkflowDashboardResponseSchema.parse({
      graphs: await this.store.listGraphs(ownerId, 500),
      nodes: await this.store.listNodes(ownerId, null, 2_000),
      templates: await this.store.listTemplates(ownerId, 500),
      variables: await this.store.listVariables(ownerId, null, 2_000),
      executionHistory: await this.store.listHistory(ownerId, null, 2_000),
      metrics: await this.store.listMetrics(ownerId, null, 1_000),
      failures: await this.store.listFailures(ownerId, null, 1_000),
      recovery: await this.store.listRecovery(ownerId, null, 1_000),
      checkpoints: await this.store.listCheckpoints(ownerId, null, 1_000),
      context: await this.store.listContext(ownerId, null, 500),
      crossApplicationOrchestration: true,
      deterministicComposition: true,
    });
  }

  async compose(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltInTemplates(input.ownerId);
    const parsed = ComposeCrossApplicationWorkflowRequestSchema.parse(input.body);
    const template = this.selectTemplate(parsed.goal, parsed.templateId ?? null);
    const capabilityMap = await this.capabilityMap(input.ownerId);
    const at = this.now().toISOString();
    const graphId = crypto.randomUUID();
    const nodes: ReturnType<typeof CrossApplicationWorkflowNodeSchema.parse>[] = [];
    for (const step of template.steps) {
      const capability = capabilityMap.get(`${step.adapterId}:${step.capabilityId}`);
      const dependencies = step.dependsOn.map((dependencyIndex) => nodes[dependencyIndex]!.id);
      nodes.push(
        CrossApplicationWorkflowNodeSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        graphId,
        nodeKind: "semantic_capability",
        status: dependencies.length === 0 ? "ready" : "pending",
        label: step.label,
        semanticCapabilityId: step.capabilityId,
        semanticDomain: capability?.domain ?? null,
        adapterId: step.adapterId,
        applicationId: capability?.applicationId ?? step.adapterId,
        dependencies,
        expectedOutputs: step.expectedOutputs,
        preconditions: [
          "Adapter must be trusted and healthy.",
          "Required permissions must be granted.",
          "Capability must be declared by the existing Core Application Adapter Suite.",
        ],
        verificationRequirements: [
          "Core adapter semantic action must return a verified or queued provider result.",
        ],
        retryPolicy,
        failurePolicy: step.failurePolicy,
        estimatedDurationMs: step.estimatedDurationMs,
        approvalRequired: capability?.approvalRequired ?? false,
        actionRequest: {
          adapterId: step.adapterId,
          capabilityId: step.capabilityId,
          arguments: this.argumentsFor(parsed.variables, step),
          origin: parsed.origin,
        },
        startedAt: null,
        completedAt: null,
        errorCode: capability ? null : "CAPABILITY_NOT_DECLARED",
        updatedAt: at,
        }),
      );
    }
    const graph = CrossApplicationWorkflowGraphSchema.parse({
      id: graphId,
      ownerId: input.ownerId,
      goal: parsed.goal,
      templateId: template.id,
      status: "composed",
      nodeCount: nodes.length,
      edgeCount: nodes.reduce((total, node) => total + node.dependencies.length, 0),
      parallelism: Math.max(1, Math.min(20, nodes.filter((node) => node.dependencies.length === 0).length)),
      deterministicComposer: true,
      plannerApplicationSpecificLogicAvailable: false,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
      failureCode: nodes.some((node) => node.errorCode) ? "CAPABILITY_GAP" : null,
    });
    await this.store.saveGraph(graph);
    for (const node of nodes) await this.store.saveNode(node);
    for (const [key, value] of Object.entries(parsed.variables)) {
      await this.store.saveVariable(
        WorkflowVariable18FSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          graphId,
          key,
          value,
          valueType: valueType(value),
          source: "user",
          required: false,
          description: "User-provided workflow variable.",
          updatedAt: at,
        }),
      );
    }
    await this.store.saveContext(
      WorkflowContext18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        graphId,
        currentNodeId: nodes.find((node) => node.status === "ready")?.id ?? null,
        currentApplicationId: null,
        currentAdapterId: null,
        variables: parsed.variables,
        selectedObjectType: null,
        updatedAt: at,
      }),
    );
    await this.history(input.ownerId, graphId, null, "WORKFLOW_COMPOSED", `Composed "${template.name}" as a ${nodes.length}-node DAG.`, { origin: parsed.origin });
    await this.audit({
      eventType: "WORKFLOW_SYNTHESIZED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Cross-application workflow composed through deterministic semantic capabilities.",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      metadata: { graphId, templateId: template.id, nodeCount: nodes.length },
    });
    return this.detail(input.ownerId, graphId);
  }

  async detail(ownerId: string, graphId: string) {
    const graph = await this.requireGraph(ownerId, graphId);
    return CrossApplicationWorkflowDashboardResponseSchema.parse({
      graphs: [graph],
      nodes: await this.store.listNodes(ownerId, graphId, 1_000),
      templates: await this.store.listTemplates(ownerId, 500),
      variables: await this.store.listVariables(ownerId, graphId, 1_000),
      executionHistory: await this.store.listHistory(ownerId, graphId, 1_000),
      metrics: await this.store.listMetrics(ownerId, graphId, 500),
      failures: await this.store.listFailures(ownerId, graphId, 500),
      recovery: await this.store.listRecovery(ownerId, graphId, 500),
      checkpoints: await this.store.listCheckpoints(ownerId, graphId, 500),
      context: await this.store.listContext(ownerId, graphId, 100),
      crossApplicationOrchestration: true,
      deterministicComposition: true,
    });
  }

  async start(input: {
    ownerId: string;
    sessionId: string;
    networkState: NetworkVerificationState;
    graphId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const graph = await this.requireGraph(input.ownerId, input.graphId);
    if (["completed", "cancelled", "failed"].includes(graph.status)) {
      throw new ExecutionError(409, "WORKFLOW_TERMINAL", "Workflow is already terminal.");
    }
    await this.store.saveGraph(
      CrossApplicationWorkflowGraphSchema.parse({
        ...graph,
        status: "running",
        updatedAt: this.now().toISOString(),
      }),
    );
    await this.history(input.ownerId, input.graphId, null, "WORKFLOW_STARTED", "Workflow execution started.", {});
    return this.advance(input);
  }

  async pause(ownerId: string, graphId: string, reason = "Workflow paused by owner.") {
    const graph = await this.requireGraph(ownerId, graphId);
    await this.store.saveGraph(
      CrossApplicationWorkflowGraphSchema.parse({
        ...graph,
        status: "paused",
        updatedAt: this.now().toISOString(),
      }),
    );
    await this.history(ownerId, graphId, null, "WORKFLOW_PAUSED", reason, {});
    return this.detail(ownerId, graphId);
  }

  async cancel(ownerId: string, graphId: string, reason = "Workflow cancelled by owner.") {
    const graph = await this.requireGraph(ownerId, graphId);
    const at = this.now().toISOString();
    await this.store.saveGraph(
      CrossApplicationWorkflowGraphSchema.parse({
        ...graph,
        status: "cancelled",
        updatedAt: at,
        completedAt: at,
      }),
    );
    await this.history(ownerId, graphId, null, "WORKFLOW_CANCELLED", reason, {});
    return this.detail(ownerId, graphId);
  }

  async recover(ownerId: string, graphId: string) {
    const graph = await this.requireGraph(ownerId, graphId);
    const at = this.now().toISOString();
    await this.store.saveRecovery(
      WorkflowRecovery18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId,
        nodeId: null,
        strategy: "manual_intervention",
        status: "suggested",
        summary: "Owner can fix permissions/provider health, then resume execution.",
        createdAt: at,
      }),
    );
    await this.store.saveGraph(
      CrossApplicationWorkflowGraphSchema.parse({
        ...graph,
        status: "recovering",
        updatedAt: at,
      }),
    );
    await this.history(ownerId, graphId, null, "RECOVERY_SUGGESTED", "Recovery suggestion created.", {});
    return this.detail(ownerId, graphId);
  }

  private async advance(input: {
    ownerId: string;
    sessionId: string;
    networkState: NetworkVerificationState;
    graphId: string;
    requestId: string;
    ipAddress: string;
  }) {
    let graph = await this.requireGraph(input.ownerId, input.graphId);
    let nodes = await this.store.listNodes(input.ownerId, input.graphId, 1_000);
    while (graph.status === "running") {
      nodes = this.refreshReady(nodes);
      for (const node of nodes) await this.store.saveNode(node);
      const ready = nodes.filter((node) => node.status === "ready");
      if (ready.length === 0) break;
      for (const node of ready) {
        if (node.approvalRequired) {
          await this.openCheckpoint(input.ownerId, graph.id, node.id);
          graph = CrossApplicationWorkflowGraphSchema.parse({
            ...graph,
            status: "waiting_approval",
            updatedAt: this.now().toISOString(),
          });
          await this.store.saveGraph(graph);
          await this.history(input.ownerId, graph.id, node.id, "APPROVAL_REQUIRED", `${node.label} requires existing approval workflow.`, {});
          return this.detail(input.ownerId, graph.id);
        }
        const startedAt = this.now().toISOString();
        await this.store.saveNode(
          CrossApplicationWorkflowNodeSchema.parse({
            ...node,
            status: "running",
            startedAt,
            updatedAt: startedAt,
          }),
        );
        if (!node.actionRequest) {
          await this.failNode(input.ownerId, graph, node.id, "ACTION_REQUEST_MISSING", "Workflow node has no semantic action request.");
          return this.detail(input.ownerId, graph.id);
        }
        const result = await this.coreAdapters.executeSemanticAction({
          ownerId: input.ownerId,
          sessionId: input.sessionId,
          networkState: input.networkState,
          body: node.actionRequest,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
        });
        const completedAt = this.now().toISOString();
        if (result.action.status !== "verified") {
          await this.failNode(
            input.ownerId,
            graph,
            node.id,
            result.action.errorCode ?? "ADAPTER_ACTION_FAILED",
            result.action.verificationSummary,
          );
          return this.detail(input.ownerId, graph.id);
        }
        await this.store.saveNode(
          CrossApplicationWorkflowNodeSchema.parse({
            ...node,
            status: "completed",
            startedAt,
            completedAt,
            updatedAt: completedAt,
          }),
        );
        await this.propagateOutputs(input.ownerId, graph.id, node, completedAt);
        await this.history(input.ownerId, graph.id, node.id, "NODE_COMPLETED", `${node.label} completed through ${node.adapterId}.`, { capabilityId: node.semanticCapabilityId });
      }
      graph = await this.requireGraph(input.ownerId, input.graphId);
      nodes = await this.store.listNodes(input.ownerId, input.graphId, 1_000);
      if (nodes.every((node) => node.status === "completed" || node.status === "skipped")) {
        const at = this.now().toISOString();
        graph = CrossApplicationWorkflowGraphSchema.parse({
          ...graph,
          status: "completed",
          updatedAt: at,
          completedAt: at,
        });
        await this.store.saveGraph(graph);
        await this.store.saveMetric(
          WorkflowMetric18FSchema.parse({
            id: crypto.randomUUID(),
            ownerId: input.ownerId,
            graphId: graph.id,
            durationMs: Math.max(0, Date.parse(at) - Date.parse(graph.createdAt)),
            successRate: 1,
            retryCount: 0,
            nodeCount: nodes.length,
            applicationCount: new Set(nodes.map((node) => node.applicationId).filter(Boolean)).size,
            measuredAt: at,
          }),
        );
        await this.history(input.ownerId, graph.id, null, "WORKFLOW_COMPLETED", "Workflow completed with semantic adapter actions.", {});
      }
    }
    return this.detail(input.ownerId, input.graphId);
  }

  private async failNode(
    ownerId: string,
    graph: ReturnType<typeof CrossApplicationWorkflowGraphSchema.parse>,
    nodeId: string,
    errorCode: string,
    summary: string,
  ) {
    const nodes = await this.store.listNodes(ownerId, graph.id, 1_000);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const at = this.now().toISOString();
    if (node) {
      await this.store.saveNode(
        CrossApplicationWorkflowNodeSchema.parse({
          ...node,
          status: "failed",
          completedAt: at,
          errorCode,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveGraph(
      CrossApplicationWorkflowGraphSchema.parse({
        ...graph,
        status: "failed",
        failureCode: errorCode,
        updatedAt: at,
        completedAt: at,
      }),
    );
    await this.store.saveFailure(
      WorkflowFailure18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId: graph.id,
        nodeId,
        errorCode,
        summary,
        recoveryAvailable: true,
        createdAt: at,
      }),
    );
    await this.store.saveRecovery(
      WorkflowRecovery18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId: graph.id,
        nodeId,
        strategy: node?.failurePolicy ?? "manual_intervention",
        status: "suggested",
        summary: "Workflow stopped. Deterministic recovery requires owner review.",
        createdAt: at,
      }),
    );
    await this.history(ownerId, graph.id, nodeId, "NODE_FAILED", summary, { errorCode });
  }

  private refreshReady(nodes: ReturnType<typeof CrossApplicationWorkflowNodeSchema.parse>[]) {
    const completed = new Set(
      nodes
        .filter((node) => node.status === "completed" || node.status === "skipped")
        .map((node) => node.id),
    );
    return nodes.map((node) =>
      node.status === "pending" &&
      node.dependencies.every((dependency) => completed.has(dependency))
        ? CrossApplicationWorkflowNodeSchema.parse({
            ...node,
            status: "ready",
            updatedAt: this.now().toISOString(),
          })
        : node,
    );
  }

  private async propagateOutputs(
    ownerId: string,
    graphId: string,
    node: ReturnType<typeof CrossApplicationWorkflowNodeSchema.parse>,
    at: string,
  ) {
    const existing = await this.store.listContext(ownerId, graphId, 1);
    const variables = { ...(existing[0]?.variables ?? {}) };
    for (const output of node.expectedOutputs) variables[output] = node.label;
    await this.store.saveContext(
      WorkflowContext18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId,
        currentNodeId: node.id,
        currentApplicationId: node.applicationId,
        currentAdapterId: node.adapterId,
        variables,
        selectedObjectType: null,
        updatedAt: at,
      }),
    );
  }

  private async openCheckpoint(ownerId: string, graphId: string, nodeId: string) {
    const at = this.now().toISOString();
    await this.store.saveCheckpoint(
      WorkflowCheckpoint18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId,
        nodeId,
        status: "open",
        reason: "This node requires the existing approval workflow before execution.",
        riskLevel: "high",
        createdAt: at,
        resolvedAt: null,
      }),
    );
    const nodes = await this.store.listNodes(ownerId, graphId, 1_000);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node) {
      await this.store.saveNode(
        CrossApplicationWorkflowNodeSchema.parse({
          ...node,
          status: "waiting_approval",
          updatedAt: at,
        }),
      );
    }
  }

  private async capabilityMap(ownerId: string) {
    const dashboard = await this.coreAdapters.dashboard(ownerId);
    return new Map<string, CoreAdapterCapabilityRecord>(
      dashboard.capabilities.map((capability) => [
        `${capability.adapterId}:${capability.capabilityId}`,
        capability,
      ]),
    );
  }

  private argumentsFor(
    variables: Record<string, unknown>,
    step: PlanStep,
  ): Record<string, unknown> {
    const output: Record<string, unknown> = { ...variables };
    if (step.capabilityId === "Browser.OpenLocalhost") output.url = "http://localhost:3000";
    if (step.capabilityId === "Browser.OpenUrl" && !output.url) output.url = "about:blank";
    return output;
  }

  private selectTemplate(goal: string, templateId: string | null) {
    if (templateId) {
      const found = builtInTemplates.find((template) => template.id === templateId);
      if (found) return found;
    }
    const normalized = goal.toLowerCase();
    return (
      builtInTemplates.find((template) =>
        template.keywords.some((keyword) => normalized.includes(keyword)),
      ) ?? builtInTemplates[0]!
    );
  }

  private async ensureBuiltInTemplates(ownerId: string) {
    const at = this.now().toISOString();
    for (const template of builtInTemplates) {
      await this.store.saveTemplate(
        CrossApplicationWorkflowTemplateSchema.parse({
          id: template.id,
          ownerId,
          name: template.name,
          description: template.description,
          category: template.category,
          capabilityIds: template.steps.map((step) => step.capabilityId),
          variableKeys: [...new Set(template.steps.flatMap((step) => step.variableOutputs))],
          editable: true,
          source: "built_in",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private async requireGraph(ownerId: string, graphId: string) {
    const graph = await this.store.findGraph(ownerId, graphId);
    if (!graph) throw new ExecutionError(404, "WORKFLOW_NOT_FOUND", "Workflow graph not found.");
    return graph;
  }

  private async history(
    ownerId: string,
    graphId: string,
    nodeId: string | null,
    eventType: string,
    summary: string,
    metadata: Record<string, unknown>,
  ) {
    await this.store.saveHistory(
      WorkflowExecutionHistory18FSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        graphId,
        nodeId,
        eventType,
        summary,
        metadata,
        createdAt: this.now().toISOString(),
      }),
    );
  }
}

export class WorkflowComposer extends CrossApplicationWorkflowService {}
export class WorkflowExecutionManager extends CrossApplicationWorkflowService {}
export class WorkflowGraphService extends CrossApplicationWorkflowService {}
export class WorkflowTemplateService extends CrossApplicationWorkflowService {}
export class WorkflowContextService extends CrossApplicationWorkflowService {}
export class WorkflowRecoveryService extends CrossApplicationWorkflowService {}
export class WorkflowMetricsService extends CrossApplicationWorkflowService {}
