import {
  CompleteWorkforceTaskRequestSchema,
  CreateWorkforceMessageRequestSchema,
  CreateWorkforceTaskRequestSchema,
  SubmitWorkforceReviewRequestSchema,
  WorkforceRuntimeDashboardSchema,
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
  type AgentRecord,
  type SpecialistRequirement,
  type WorkforceMatchScore,
  type WorkforceGapResolution,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import { z } from "zod";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import type { AgentFactoryService } from "../agents/factory.js";
import type { AgentOsService } from "../agents/os-service.js";
import type { AgentStore } from "../agents/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { CapabilityStudioService } from "../capability-studio/service.js";
import type { ExternalHarvestService } from "../external-harvest/service.js";
import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { WorkforceRuntimeStore } from "./store.js";

const MAX_CONCURRENT = 6;
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
const MAX_CHILDREN = 8;
const MAX_MESSAGES_PER_TASK = 40;
const MATCH_THRESHOLDS = { strong: 0.82, adaptable: 0.62, duplicate: 0.78 } as const;
const RuntimeResultSchema = z
  .object({
    summary: z.string().min(1).max(4_000),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1).max(160)).max(20).default([]),
  })
  .strict();
const DevelopmentInputSchema = z
  .object({
    sourceCode: z.string().min(1).max(20_000),
    testObjective: z.string().min(1).max(1_000),
  })
  .strict();

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[._-]+/g, " ")
    .trim();
const fit = (required: string[], available: string[]) => {
  if (!required.length) return 1;
  const haystack = available.map(normalized);
  return (
    required.filter((item) =>
      haystack.some(
        (value) => value.includes(normalized(item)) || normalized(item).includes(value),
      ),
    ).length / required.length
  );
};
const round = (value: number) =>
  Math.round(Math.max(0, Math.min(1, value)) * 1_000) / 1_000;

export class WorkforceRuntimeService {
  readonly #controllers = new Map<string, AbortController>();
  readonly #metrics = new Map<
    string,
    {
      assignments: number;
      providerCalls: number;
      matchingLatencyTotalMs: number;
      peakActiveAgents: number;
    }
  >();
  private lifecycleSink:
    | { handleWorkforceTaskChanged(task: WorkforceRuntimeTask): Promise<void> }
    | undefined;
  constructor(
    readonly store: WorkforceRuntimeStore,
    readonly agentStore: AgentStore,
    readonly workforce: AgentWorkforceService,
    readonly economy: AgentEconomyService,
    readonly agentOs: AgentOsService,
    readonly externalHarvest: ExternalHarvestService,
    readonly aiRouter: AIRouterService,
    readonly capabilityStudio: CapabilityStudioService,
    readonly agentFactory: AgentFactoryService | undefined,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  setLifecycleSink(sink: NonNullable<WorkforceRuntimeService["lifecycleSink"]>) {
    this.lifecycleSink = sink;
  }

  async dashboard(ownerId: string) {
    const [tasks, messages, reviews, agents, economy] = await Promise.all([
      this.store.listTasks(ownerId, 500),
      this.store.listMessages(ownerId, 500),
      this.store.listReviews(ownerId, 500),
      this.agentStore.listAgents(ownerId),
      this.economy.dashboard(ownerId),
    ]);
    return WorkforceRuntimeDashboardSchema.parse({
      summary: {
        registered: agents.length,
        active: economy.overview.activeAgents,
        dormant: economy.overview.dormantAgents,
        queued: tasks.filter((item) =>
          ["CREATED", "QUEUED", "MATCHING"].includes(item.status),
        ).length,
        running: tasks.filter((item) =>
          ["ASSIGNED", "RESERVED", "RUNNING"].includes(item.status),
        ).length,
        waitingReview: tasks.filter((item) => item.status === "REVIEW_REQUIRED").length,
        completed: tasks.filter((item) => item.status === "COMPLETED").length,
        failed: tasks.filter((item) => item.status === "FAILED").length,
        maxConcurrent: MAX_CONCURRENT,
      },
      tasks,
      messages,
      reviews,
      metrics: {
        assignments: this.metrics(ownerId).assignments,
        providerCalls: this.metrics(ownerId).providerCalls,
        matchingLatencyMs: this.metrics(ownerId).assignments
          ? this.metrics(ownerId).matchingLatencyTotalMs /
            this.metrics(ownerId).assignments
          : 0,
        peakActiveAgents: this.metrics(ownerId).peakActiveAgents,
        completionRate: tasks.length
          ? tasks.filter((item) => item.status === "COMPLETED").length / tasks.length
          : 0,
      },
      invariants: {
        sharedAIRouter: true,
        dedicatedModelPerAgent: false,
        hierarchyGrantsAuthority: false,
        creditsGrantAuthority: false,
        maxTaskDepth: 4,
      },
    });
  }

  async createTask(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = CreateWorkforceTaskRequestSchema.parse(input.body);
    if (body.idempotencyKey) {
      const duplicate = (await this.store.listTasks(input.ownerId, 500)).find(
        (task) =>
          task.idempotencyKey === body.idempotencyKey &&
          task.createdByAgentId === body.createdByAgentId,
      );
      if (duplicate) return { task: duplicate };
    }
    const parent = body.parentTaskId
      ? await this.requireTask(input.ownerId, body.parentTaskId)
      : null;
    if (parent && !["RUNNING", "WAITING", "REVIEW_REQUIRED"].includes(parent.status))
      throw new ExecutionError(
        409,
        "PARENT_TASK_NOT_ACTIVE",
        "Child tasks require an active parent task.",
      );
    if (parent && parent.depth >= 4)
      throw new ExecutionError(
        409,
        "TASK_DEPTH_LIMIT",
        "The bounded task depth limit is four.",
      );
    if (parent) {
      const siblings = (await this.store.listTasks(input.ownerId, 500)).filter(
        (task) => task.parentTaskId === parent.id,
      );
      if (siblings.length >= MAX_CHILDREN)
        throw new ExecutionError(
          409,
          "TASK_CHILD_LIMIT",
          "The parent task reached its bounded child-task limit.",
        );
      const committed = siblings.reduce((sum, task) => sum + task.economicBudget, 0);
      if (committed + body.economicBudget > parent.economicBudget)
        throw new ExecutionError(
          409,
          "CHILD_BUDGET_EXCEEDS_PARENT",
          "Child task budgets cannot exceed the parent task budget.",
        );
      if (body.memoryScopeRefs.some((scope) => !parent.memoryScopeRefs.includes(scope)))
        throw new ExecutionError(
          403,
          "CHILD_MEMORY_SCOPE_EXPANSION",
          "Child tasks cannot expand the parent memory scope.",
        );
    }
    const creator = body.createdByAgentId
      ? await this.requireAgent(input.ownerId, body.createdByAgentId)
      : null;
    const assigned = body.assignedAgentId
      ? await this.requireAgent(input.ownerId, body.assignedAgentId)
      : null;
    const companyAssignment = assigned
      ? await this.agentStore.findAssignment(input.ownerId, assigned.id)
      : null;
    if (creator && assigned)
      this.assertDelegationAuthority(creator, assigned, body.type);
    const at = this.now().toISOString();
    const id = crypto.randomUUID();
    const task = WorkforceRuntimeTaskSchema.parse({
      id,
      idempotencyKey: body.idempotencyKey,
      ownerId: input.ownerId,
      organizationId:
        creator?.workforce?.organizationId ??
        assigned?.workforce?.organizationId ??
        null,
      createdByAgentId: creator?.id ?? null,
      assignedAgentId: assigned?.id ?? null,
      agentDefinitionId: assigned?.id ?? null,
      companyAssignmentId: companyAssignment?.id ?? null,
      parentTaskId: parent?.id ?? null,
      rootTaskId: parent?.rootTaskId ?? id,
      depth: parent ? parent.depth + 1 : 0,
      type: body.type,
      title: body.title,
      objective: body.objective,
      inputs: body.inputs,
      evidenceRefs: body.evidenceRefs,
      memoryScopeRefs: body.memoryScopeRefs,
      requiredSkills: body.requiredSkills,
      requiredCapabilities: body.requiredCapabilities,
      preferredDepartmentId:
        body.preferredDepartmentId ?? creator?.workforce?.departmentId ?? null,
      priority: body.priority,
      riskLevel: body.riskLevel,
      economicBudget: body.economicBudget,
      reservedCredits: 0,
      actualCost: 0,
      reservationId: null,
      status: "QUEUED",
      retryCount: 0,
      maxRetries: body.maxRetries,
      selection: [],
      requirement: null,
      workforceGap: null,
      resultSummary: null,
      resultConfidence: null,
      aiRequestId: null,
      providerId: null,
      modelId: null,
      createdAt: at,
      updatedAt: at,
      sandboxStatus: null,
      artifactCount: 0,
      startedAt: null,
      completedAt: null,
      expiresAt: body.expiresAt,
    });
    await this.store.saveTask(task);
    await this.lifecycleSink?.handleWorkforceTaskChanged(task);
    if (creator)
      await this.message(
        input.ownerId,
        task,
        creator.id,
        assigned?.id ?? null,
        assigned ? "DELEGATION" : "TASK",
        { title: task.title },
        task.evidenceRefs,
      );
    await this.auditEvent(
      input,
      "WORKFORCE_TASK_CREATED",
      "Bounded workforce task created; no authority was granted.",
      {
        taskId: task.id,
        creatorAgentId: task.createdByAgentId,
        parentTaskId: task.parentTaskId,
      },
    );
    return { task };
  }

  async schedule(
    ownerId: string,
    taskId: string,
    requestId: string,
    ipAddress: string,
  ) {
    const matchingStartedAt = performance.now();
    let task = await this.requireTask(ownerId, taskId);
    const previouslyCreatedSpecialist =
      task.workforceGap?.decision === "SPECIALIST_CREATED"
        ? task.workforceGap.selectedAgentId
        : null;
    if (
      !["QUEUED", "MATCHING", "WAITING"].includes(task.status) ||
      (task.status === "WAITING" && !previouslyCreatedSpecialist)
    )
      throw new ExecutionError(
        409,
        "TASK_NOT_QUEUEABLE",
        "Only queued tasks or tasks with an approved specialist can be scheduled.",
      );
    if (task.expiresAt && task.expiresAt <= this.now().toISOString())
      return { task: await this.update(task, { status: "EXPIRED" }) };
    if (previouslyCreatedSpecialist)
      await this.seedApprovedSpecialistBudget(
        ownerId,
        task,
        previouslyCreatedSpecialist,
        requestId,
        ipAddress,
      );
    const allTasks = await this.store.listTasks(ownerId, 500);
    const higherPriorityQueued = allTasks.some(
      (item) =>
        item.id !== task.id &&
        item.status === "QUEUED" &&
        PRIORITY_RANK[item.priority] > PRIORITY_RANK[task.priority],
    );
    if (higherPriorityQueued)
      throw new ExecutionError(
        409,
        "HIGHER_PRIORITY_WORK_PENDING",
        "A higher-priority queued task must receive the next available workforce slot.",
      );
    if (
      allTasks.filter((item) => ["RESERVED", "RUNNING"].includes(item.status)).length >=
      MAX_CONCURRENT
    )
      throw new ExecutionError(
        409,
        "WORKFORCE_CONCURRENCY_LIMIT",
        "The bounded active-workforce limit is reached.",
      );
    task = await this.update(task, { status: "MATCHING" });
    const [agents, economy] = await Promise.all([
      this.agentStore.listAgents(ownerId),
      this.economy.dashboard(ownerId),
    ]);
    const requirement = this.requirementFor(task);
    const accountByAgent = new Map(
      economy.accounts.map((account) => [account.agentId, account]),
    );
    const performanceByAgent = new Map(
      economy.performance.map((item) => [item.agentId, item]),
    );
    const activeByAgent = new Map<string, number>();
    for (const active of allTasks.filter(
      (item) =>
        ["ASSIGNED", "RESERVED", "RUNNING"].includes(item.status) &&
        item.assignedAgentId,
    ))
      activeByAgent.set(
        active.assignedAgentId!,
        (activeByAgent.get(active.assignedAgentId!) ?? 0) + 1,
      );
    let scores = agents
      .map((agent) =>
        this.score(
          task,
          requirement,
          agent,
          accountByAgent.get(agent.id),
          performanceByAgent.get(agent.id),
          activeByAgent.get(agent.id) ?? 0,
        ),
      )
      .sort((a, b) => b.finalScore - a.finalScore || a.agentId.localeCompare(b.agentId))
      .slice(0, 20);
    let chosen = task.assignedAgentId
      ? scores.find((score) => score.agentId === task.assignedAgentId && score.eligible)
      : previouslyCreatedSpecialist
        ? scores.find(
            (score) => score.agentId === previouslyCreatedSpecialist && score.eligible,
          )
        : scores.find((score) => score.eligible && score.category !== "WEAK_MATCH");
    if (!chosen) {
      if (previouslyCreatedSpecialist) {
        const reason =
          "The approved specialist could not receive its bounded task reservation yet.";
        const unresolved = { ...task.workforceGap!, reasons: [reason] };
        await this.update(task, {
          status: "WAITING",
          selection: scores,
          requirement,
          workforceGap: unresolved,
        });
        throw new ExecutionError(409, "NO_ELIGIBLE_AGENT", reason);
      }
      const resolved = await this.resolveWorkforceGap(
        ownerId,
        task,
        requirement,
        scores,
        requestId,
        ipAddress,
      );
      if (resolved.selectedAgentId) {
        await this.seedApprovedSpecialistBudget(
          ownerId,
          task,
          resolved.selectedAgentId,
          requestId,
          ipAddress,
        );
        const refreshedAgents = await this.agentStore.listAgents(ownerId);
        const refreshedEconomy = await this.economy.dashboard(ownerId);
        const refreshedAccounts = new Map(
          refreshedEconomy.accounts.map((account) => [account.agentId, account]),
        );
        const refreshedPerformance = new Map(
          refreshedEconomy.performance.map((item) => [item.agentId, item]),
        );
        const selected = refreshedAgents.find(
          (agent) => agent.id === resolved.selectedAgentId,
        );
        if (selected) {
          const selectedScore = this.score(
            task,
            requirement,
            selected,
            refreshedAccounts.get(selected.id),
            refreshedPerformance.get(selected.id),
            activeByAgent.get(selected.id) ?? 0,
          );
          chosen = selectedScore.eligible ? selectedScore : undefined;
          scores = [
            selectedScore,
            ...scores.filter((score) => score.agentId !== selectedScore.agentId),
          ].slice(0, 20);
        }
      }
      if (!chosen) {
        await this.update(task, {
          status: "WAITING",
          selection: scores,
          requirement,
          workforceGap: resolved,
        });
        throw new ExecutionError(
          409,
          resolved.blockerCode ?? "NO_ELIGIBLE_AGENT",
          resolved.reasons[0] ?? "No eligible workforce agent is available.",
        );
      }
    }
    const agent = await this.requireAgent(ownerId, chosen.agentId);
    const companyAssignment = await this.agentStore.findAssignment(ownerId, agent.id);
    if (!companyAssignment || companyAssignment.status === "REVOKED")
      throw new ExecutionError(
        409,
        "WORKFORCE_ASSIGNMENT_INVALID",
        "The selected company specialist assignment is no longer valid.",
      );
    if (task.createdByAgentId)
      this.assertDelegationAuthority(
        await this.requireAgent(ownerId, task.createdByAgentId),
        agent,
        task.type === "CAPABILITY_REQUEST" ? "QUESTION" : task.type,
      );
    task = await this.update(task, {
      status: "ASSIGNED",
      assignedAgentId: agent.id,
      agentDefinitionId: agent.id,
      companyAssignmentId: companyAssignment.id,
      selection: scores,
      requirement,
      workforceGap: null,
    });
    await this.workforce.setActivation(
      ownerId,
      agent.id,
      "ACTIVE",
      requestId,
      ipAddress,
    );
    try {
      const reserveAmount = Math.max(1, Math.min(task.economicBudget, 10));
      const reservation = await this.economy.reserve({
        ownerId,
        agentId: agent.id,
        amount: reserveAmount,
        costType: "TASK_EXECUTION",
        reasonCode: "WORKFORCE_TASK_RESERVATION",
        idempotencyKey: `workforce-task:${task.id}`,
        references: { taskId: task.id },
      });
      task = await this.update(task, {
        status: "RESERVED",
        reservationId: reservation.reservation.id,
        reservedCredits: reserveAmount,
      });
      const metrics = this.metrics(ownerId);
      metrics.assignments++;
      metrics.matchingLatencyTotalMs += performance.now() - matchingStartedAt;
      metrics.peakActiveAgents = Math.max(
        metrics.peakActiveAgents,
        allTasks.filter((item) => ["RESERVED", "RUNNING"].includes(item.status))
          .length + 1,
      );
      await this.audit({
        eventType: "WORKFORCE_TASK_SCHEDULED",
        ownerId,
        outcome: "SUCCESS",
        reason: "Deterministic scheduler selected and reserved one bounded specialist.",
        requestId,
        ipAddress,
        metadata: {
          taskId,
          agentId: agent.id,
          score: chosen.finalScore,
          reservationId: reservation.reservation.id,
        },
      });
      return { task };
    } catch (error) {
      await this.workforce.setActivation(
        ownerId,
        agent.id,
        "DORMANT",
        requestId,
        ipAddress,
      );
      await this.update(task, { status: "QUEUED", assignedAgentId: null });
      throw error;
    }
  }

  async execute(ownerId: string, taskId: string, requestId: string, ipAddress: string) {
    let task = await this.requireTask(ownerId, taskId);
    if (task.status === "COMPLETED") return { task };
    if (this.#controllers.has(task.id))
      throw new ExecutionError(
        409,
        "TASK_EXECUTION_LEASE_HELD",
        "This task already has one bounded runtime lease.",
      );
    if (task.status === "QUEUED")
      task = (await this.schedule(ownerId, taskId, requestId, ipAddress)).task;
    if (task.status !== "RESERVED" || !task.assignedAgentId || !task.reservationId)
      throw new ExecutionError(
        409,
        "TASK_NOT_RESERVED",
        "Task execution requires a selected agent and economic reservation.",
      );
    const agent = await this.requireAgent(ownerId, task.assignedAgentId);
    const companyAssignment = await this.agentStore.findAssignment(ownerId, agent.id);
    if (
      !companyAssignment ||
      companyAssignment.status === "REVOKED" ||
      task.companyAssignmentId !== companyAssignment.id ||
      task.agentDefinitionId !== agent.id
    )
      throw new ExecutionError(
        409,
        "WORKFORCE_ASSIGNMENT_INVALID",
        "The company specialist assignment changed before runtime activation.",
      );
    const reservationId = task.reservationId;
    const controller = new AbortController();
    this.#controllers.set(task.id, controller);
    task = await this.update(task, {
      status: "RUNNING",
      startedAt: this.now().toISOString(),
    });
    let sessionId: string | null = null;
    try {
      const developmentInput = DevelopmentInputSchema.safeParse(
        task.inputs.developmentInput,
      );
      if (developmentInput.success) {
        const delegated = await this.externalHarvest.executeDelegation({
          ownerId,
          requestId,
          ipAddress,
          signal: controller.signal,
          body: {
            managerAgentId: task.createdByAgentId ?? "engineering_manager",
            specialistAgentId: agent.id,
            task: task.objective,
            contextSummary: `${task.title}. Only supplied source and bounded evidence are in scope.`,
            requestedMemoryScopes: ["ENGINEERING"],
            requestedCapabilities: task.requiredCapabilities,
            requestedSkills: task.requiredSkills,
            tokenBudget: 8_000,
            costBudgetUsd: Math.min(5, task.economicBudget / 100),
            sandboxProfileId: "registered_validation_readonly",
            developmentInput: developmentInput.data,
          },
        });
        this.metrics(ownerId).providerCalls++;
        if (delegated.status !== "COMPLETE")
          throw new ExecutionError(
            502,
            "SANDBOX_DELEGATION_FAILED",
            "The bounded development delegation failed closed.",
          );
        const actualCost = Math.max(1, Math.min(task.reservedCredits, 2));
        await this.economy.settle({
          ownerId,
          agentId: agent.id,
          reservationId,
          actualCost,
          idempotencyKey: `workforce-settle:${task.id}`,
          reasonCode: "WORKFORCE_SANDBOX_TASK_SETTLED",
          references: { taskId: task.id },
        });
        task = await this.update(task, {
          status: "REVIEW_REQUIRED",
          resultSummary: delegated.summary,
          resultConfidence: delegated.confidence,
          actualCost,
          aiRequestId: delegated.ai.requestId,
          providerId: delegated.ai.providerId,
          modelId: delegated.ai.modelId,
          sandboxStatus: delegated.tests?.status ?? "UNAVAILABLE",
          artifactCount: delegated.artifacts.length,
          evidenceRefs: [
            ...new Set([
              ...task.evidenceRefs,
              ...delegated.artifacts.map((artifact) => `artifact:${artifact.name}`),
            ]),
          ],
        });
        await this.message(
          ownerId,
          task,
          agent.id,
          task.createdByAgentId,
          "REVIEW_REQUEST",
          {
            summary: delegated.summary,
            sandboxStatus: task.sandboxStatus,
            artifactCount: task.artifactCount,
          },
          task.evidenceRefs,
        );
        return { task };
      }
      const runtime = await this.agentOs.startIsolatedDelegation({
        ownerId,
        managerAgentId: task.createdByAgentId ?? "engineering_manager",
        specialistAgentId: agent.id,
        delegationId: task.id,
        task: task.objective,
        contextSummary: `${task.title}. Evidence references: ${task.evidenceRefs.join(", ") || "none"}.`,
        memoryRefs: [],
        memoryScopes: [agent.workforce?.memoryScopeId ?? `agent:${agent.id}`],
        capabilityRefs: task.requiredCapabilities,
        skillRefs: task.requiredSkills,
        knowledgeSourceRefs: [],
        contextTokenBudget: 8_000,
        sandboxProfileId:
          agent.workforce?.executionPlacement === "LOCAL_ONLY"
            ? "local_bounded_v1"
            : "shared_bounded_v1",
        requestId,
      });
      sessionId = runtime.session.id;
      const routed = await this.aiRouter.executeStructured(
        {
          purpose: "REASONING",
          input: [{ role: "user", content: [{ type: "text", text: task.objective }] }],
          systemInstructions: [
            "You are an Athena workforce specialist. Return a bounded result only. Do not execute tools, grant authority, approve work, or expand task scope.",
          ],
          context: [
            {
              sourceType: "AGENT",
              trustLevel: "TRUSTED",
              content: {
                role: agent.displayName,
                taskId: task.id,
                evidenceRefs: task.evidenceRefs,
                memoryScopeRefs: task.memoryScopeRefs,
                allowedSkills: task.requiredSkills,
                allowedCapabilities: task.requiredCapabilities,
                parentTranscriptIncluded: false,
              },
            },
          ],
          outputMode: "STRUCTURED",
          schema: RuntimeResultSchema,
          schemaName: "alexa_workforce_task_result",
          maxOutputTokens: 1_500,
          temperature: 0.1,
          reasoning: "MEDIUM",
          risk: task.riskLevel,
          privacy:
            agent.workforce?.executionPlacement === "LOCAL_ONLY"
              ? "LOCAL_ONLY"
              : "STANDARD",
          locality:
            agent.workforce?.executionPlacement === "REMOTE_PREFERRED"
              ? "ALLOW_REMOTE"
              : "PREFER_LOCAL",
          allowCloud: agent.workforce?.executionPlacement !== "LOCAL_ONLY",
          allowFallback: true,
          allowClarification: false,
          maxAttempts: 2,
          maxCloudEscalations: 1,
          maxContextTokens: 8_000,
          economicMaxInputTokens: 8_000,
          agentId: agent.id,
          taskId: task.id,
          economicContext: {
            ownerId,
            purpose: "REASONING",
            autonomyMode: "ASSISTED",
            taskId: task.id,
            costCenter: "workforce-runtime",
          },
          metadata: {
            rootTaskId: task.rootTaskId,
            parentTaskId: task.parentTaskId,
            parentTranscriptIncluded: false,
          },
        },
        { signal: controller.signal },
      );
      this.metrics(ownerId).providerCalls++;
      const result = RuntimeResultSchema.safeParse(routed.structuredOutput);
      if (routed.outcome !== "SUCCESS" || !result.success)
        throw new ExecutionError(
          502,
          "WORKFORCE_AI_RESULT_INVALID",
          "AIRouter did not return a valid bounded workforce result.",
        );
      const actualCost = Math.max(
        1,
        Math.min(
          task.reservedCredits,
          Math.ceil((routed.usage?.totalTokens ?? 1) / 2_000),
        ),
      );
      await this.economy.settle({
        ownerId,
        agentId: agent.id,
        reservationId,
        actualCost,
        idempotencyKey: `workforce-settle:${task.id}`,
        reasonCode: "WORKFORCE_TASK_SETTLED",
        references: { taskId: task.id },
      });
      await this.agentOs.completeIsolatedDelegation({
        ownerId,
        sessionId,
        outputSummary: result.data.summary,
        confidence: result.data.confidence,
        aiRequestId: routed.requestId,
        providerId: routed.providerId ?? "unknown",
        modelId: routed.modelId ?? "unknown",
        sandboxStatus: "UNAVAILABLE",
        artifactCount: 0,
        errorCode: null,
        requestId,
      });
      const reviewRequired = task.riskLevel !== "LOW" || task.type === "REVIEW";
      task = await this.update(task, {
        status: reviewRequired ? "REVIEW_REQUIRED" : "COMPLETED",
        resultSummary: result.data.summary,
        resultConfidence: result.data.confidence,
        evidenceRefs: [...new Set([...task.evidenceRefs, ...result.data.evidence])],
        actualCost,
        aiRequestId: routed.requestId,
        providerId: routed.providerId ?? null,
        modelId: routed.modelId ?? null,
        completedAt: reviewRequired ? null : this.now().toISOString(),
      });
      await this.message(
        ownerId,
        task,
        agent.id,
        task.createdByAgentId,
        reviewRequired ? "REVIEW_REQUEST" : "RESULT",
        { summary: result.data.summary, confidence: result.data.confidence },
        task.evidenceRefs,
      );
      return { task };
    } catch (error) {
      if (task.reservationId)
        await this.economy
          .release({
            ownerId,
            agentId: agent.id,
            reservationId: task.reservationId,
            idempotencyKey: `workforce-release:${task.id}`,
            reasonCode: "WORKFORCE_TASK_FAILED",
          })
          .catch(() => undefined);
      if (sessionId)
        await this.agentOs
          .completeIsolatedDelegation({
            ownerId,
            sessionId,
            outputSummary: "Workforce task failed closed.",
            confidence: 0,
            aiRequestId: crypto.randomUUID(),
            providerId: "none",
            modelId: "none",
            sandboxStatus: "FAILED",
            artifactCount: 0,
            errorCode:
              error instanceof Error ? error.name : "WORKFORCE_EXECUTION_FAILED",
            requestId,
          })
          .catch(() => undefined);
      const retry = task.retryCount < task.maxRetries && !controller.signal.aborted;
      task = await this.update(task, {
        status: retry ? "QUEUED" : controller.signal.aborted ? "CANCELLED" : "FAILED",
        retryCount: retry ? task.retryCount + 1 : task.retryCount,
        assignedAgentId: retry ? null : task.assignedAgentId,
        reservationId: null,
        reservedCredits: 0,
      });
      if (!retry) throw error;
      return { task };
    } finally {
      this.#controllers.delete(task.id);
      await this.workforce
        .setActivation(ownerId, agent.id, "DORMANT", requestId, ipAddress)
        .catch(() => undefined);
    }
  }

  async approveSpecialistCreation(
    ownerId: string,
    taskId: string,
    body: unknown,
    requestId: string,
    ipAddress: string,
  ) {
    const parsed = z
      .object({ approved: z.boolean(), proposalId: z.string().uuid().optional() })
      .strict()
      .parse(body);
    const task = await this.requireTask(ownerId, taskId);
    const gap = task.workforceGap;
    if (!gap?.proposal || gap.decision !== "SPECIALIST_APPROVAL_PENDING")
      throw new ExecutionError(
        409,
        "NO_SPECIALIST_APPROVAL_PENDING",
        "This task is not waiting on a specialist creation decision.",
      );
    if (parsed.proposalId && parsed.proposalId !== gap.proposal.proposalId)
      throw new ExecutionError(
        409,
        "SPECIALIST_PROPOSAL_MISMATCH",
        "The approval does not match the current specialist proposal.",
      );
    if (!parsed.approved) {
      const declined = {
        ...gap,
        decision: "BLOCKED" as const,
        blockerCode: "SPECIALIST_CREATION_REQUIRED" as const,
        reasons: ["Owner declined the proposed specialist; no agent was created."],
      };
      await this.update(task, { workforceGap: declined });
      throw new ExecutionError(
        409,
        "SPECIALIST_CREATION_REQUIRED",
        "Owner declined specialist creation.",
      );
    }
    const updated = await this.update(task, {
      status: "QUEUED",
      inputs: {
        ...task.inputs,
        workforceGapApproval: { approved: true, proposalId: gap.proposal.proposalId },
      },
    });
    await this.audit({
      eventType: "WORKFORCE_TASK_SCHEDULED",
      ownerId,
      outcome: "SUCCESS",
      reason:
        "Owner approved bounded specialist creation for one workforce requirement.",
      requestId,
      ipAddress,
      metadata: {
        taskId,
        proposalId: gap.proposal.proposalId,
        specialistApproval: true,
      },
    });
    return this.schedule(ownerId, updated.id, requestId, ipAddress);
  }

  async sendMessage(ownerId: string, body: unknown) {
    const parsed = CreateWorkforceMessageRequestSchema.parse(body);
    const task = await this.requireTask(ownerId, parsed.taskId);
    await this.requireAgent(ownerId, parsed.fromAgentId);
    if (parsed.toAgentId) await this.requireAgent(ownerId, parsed.toAgentId);
    const messages = (await this.store.listMessages(ownerId, 500)).filter(
      (item) => item.taskId === task.id,
    );
    if (messages.length >= MAX_MESSAGES_PER_TASK)
      throw new ExecutionError(
        409,
        "TASK_MESSAGE_LIMIT",
        "The bounded task message limit is reached.",
      );
    const message = await this.message(
      ownerId,
      task,
      parsed.fromAgentId,
      parsed.toAgentId,
      parsed.type,
      parsed.payload,
      parsed.evidenceRefs,
    );
    return { message };
  }

  async updateObjectiveBounds(
    ownerId: string,
    taskId: string,
    patch: {
      priority?: "low" | "normal" | "high" | "urgent";
      economicBudget?: number;
      expiresAt?: string | null;
      objectiveConstraints?: string[];
    },
  ) {
    const task = await this.requireTask(ownerId, taskId);
    if (
      patch.economicBudget !== undefined &&
      patch.economicBudget < task.reservedCredits
    )
      throw new ExecutionError(
        409,
        "TASK_BUDGET_BELOW_RESERVATION",
        "Task budget cannot be reduced below its current reservation.",
      );
    return this.update(task, {
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.economicBudget !== undefined
        ? { economicBudget: patch.economicBudget }
        : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
      ...(patch.objectiveConstraints
        ? {
            inputs: {
              ...task.inputs,
              objectiveConstraints: patch.objectiveConstraints,
            },
          }
        : {}),
    });
  }

  async complete(
    ownerId: string,
    taskId: string,
    body: unknown,
    requestId: string,
    ipAddress: string,
  ) {
    const parsed = CompleteWorkforceTaskRequestSchema.parse(body);
    let task = await this.requireTask(ownerId, taskId);
    if (task.status === "COMPLETED" && task.resultSummary === parsed.resultSummary)
      return { task };
    if (!task.assignedAgentId || !["RUNNING", "WAITING"].includes(task.status))
      throw new ExecutionError(
        409,
        "TASK_NOT_COMPLETABLE",
        "Only active tasks may submit a result.",
      );
    if (parsed.actualCost > task.reservedCredits)
      throw new ExecutionError(
        409,
        "COST_EXCEEDS_RESERVATION",
        "Actual cost cannot exceed the task reservation.",
      );
    const assignedAgentId = task.assignedAgentId;
    if (task.reservationId)
      await this.economy.settle({
        ownerId,
        agentId: assignedAgentId,
        reservationId: task.reservationId,
        actualCost: parsed.actualCost,
        idempotencyKey: `manual-settle:${task.id}`,
        reasonCode: "WORKFORCE_RESULT_SETTLED",
        references: { taskId: task.id },
      });
    task = await this.update(task, {
      status:
        parsed.reviewRequired || task.riskLevel !== "LOW"
          ? "REVIEW_REQUIRED"
          : "COMPLETED",
      resultSummary: parsed.resultSummary,
      resultConfidence: parsed.resultConfidence,
      actualCost: parsed.actualCost,
      evidenceRefs: [...new Set([...task.evidenceRefs, ...parsed.evidenceRefs])],
      completedAt: parsed.reviewRequired ? null : this.now().toISOString(),
    });
    await this.workforce.setActivation(
      ownerId,
      assignedAgentId,
      "DORMANT",
      requestId,
      ipAddress,
    );
    return { task };
  }

  async review(
    ownerId: string,
    taskId: string,
    body: unknown,
    requestId: string,
    ipAddress: string,
  ) {
    const parsed = SubmitWorkforceReviewRequestSchema.parse(body);
    let task = await this.requireTask(ownerId, taskId);
    const duplicate = (await this.store.listReviews(ownerId, 500)).find(
      (item) =>
        item.taskId === taskId && item.reviewerAgentId === parsed.reviewerAgentId,
    );
    if (duplicate) return { task, review: duplicate };
    if (task.status !== "REVIEW_REQUIRED" || !task.assignedAgentId)
      throw new ExecutionError(
        409,
        "REVIEW_NOT_REQUIRED",
        "This task is not awaiting review.",
      );
    const subjectAgentId = task.assignedAgentId;
    const reviewer = await this.requireAgent(ownerId, parsed.reviewerAgentId);
    if (
      reviewer.id === subjectAgentId ||
      !["review", "security", "testing"].includes(reviewer.role)
    )
      throw new ExecutionError(
        403,
        "INDEPENDENT_REVIEWER_REQUIRED",
        "A separate eligible reviewer is required.",
      );
    const review = WorkforceRuntimeReviewSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      taskId,
      reviewerAgentId: reviewer.id,
      subjectAgentId,
      verdict: parsed.verdict,
      findings: parsed.findings,
      evidenceRefs: parsed.evidenceRefs,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveReview(review);
    task = await this.update(task, {
      status:
        parsed.verdict === "PASS"
          ? "COMPLETED"
          : parsed.verdict === "FAIL"
            ? "FAILED"
            : "WAITING",
      completedAt: parsed.verdict === "PASS" ? this.now().toISOString() : null,
      evidenceRefs: [...new Set([...task.evidenceRefs, ...parsed.evidenceRefs])],
    });
    await this.message(
      ownerId,
      task,
      reviewer.id,
      subjectAgentId,
      "REVIEW_RESULT",
      { verdict: parsed.verdict, findings: parsed.findings },
      parsed.evidenceRefs,
    );
    if (parsed.verdict === "PASS")
      await this.economy.rewardVerified({
        ownerId,
        agentId: subjectAgentId,
        amount: 1,
        authority: "WORKFLOW_EVALUATOR",
        idempotencyKey: `workforce-reward:${task.id}`,
        reasonCode: "INDEPENDENT_REVIEW_PASSED",
        outcome: {
          taskId: task.id,
          predictedSuccessProbability: task.resultConfidence ?? 0.5,
          estimatedCost: task.reservedCredits,
          estimatedDurationMs: task.startedAt
            ? Math.max(0, this.now().getTime() - new Date(task.startedAt).getTime())
            : 0,
          actualSuccess: true,
          actualCost: task.actualCost,
          actualDurationMs: task.startedAt
            ? Math.max(0, this.now().getTime() - new Date(task.startedAt).getTime())
            : 0,
          qualityScore: task.resultConfidence ?? 0.5,
          verificationResult: "VERIFIED",
          evidenceRefs: task.evidenceRefs.slice(0, 20),
        },
      });
    await this.audit({
      eventType: "WORKFORCE_TASK_REVIEWED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Independent structured review recorded.",
      requestId,
      ipAddress,
      metadata: { taskId, reviewerAgentId: reviewer.id, verdict: parsed.verdict },
    });
    return { task, review };
  }

  async cancel(ownerId: string, taskId: string, requestId: string, ipAddress: string) {
    const root = await this.requireTask(ownerId, taskId);
    this.#controllers.get(root.id)?.abort();
    const descendants = (await this.store.listTasks(ownerId, 500)).filter(
      (item) =>
        item.rootTaskId === root.rootTaskId &&
        !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(item.status),
    );
    for (const task of descendants) {
      this.#controllers.get(task.id)?.abort();
      await this.update(task, { status: "CANCELLED" });
      if (task.reservationId && task.assignedAgentId)
        await this.economy
          .release({
            ownerId,
            agentId: task.assignedAgentId,
            reservationId: task.reservationId,
            idempotencyKey: `cancel:${task.id}`,
            reasonCode: "ROOT_TASK_CANCELLED",
          })
          .catch(() => undefined);
    }
    await this.audit({
      eventType: "WORKFORCE_TASK_CANCELLED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Root cancellation propagated through the bounded task tree.",
      requestId,
      ipAddress,
      metadata: { rootTaskId: root.rootTaskId, cancelledCount: descendants.length },
    });
    return this.dashboard(ownerId);
  }

  async recover(ownerId: string, requestId: string, ipAddress: string) {
    const uncertain = (await this.store.listTasks(ownerId, 500)).filter((task) =>
      ["ASSIGNED", "RESERVED", "RUNNING"].includes(task.status),
    );
    for (const task of uncertain)
      await this.update(task, { status: "RECOVERY_REVIEW_REQUIRED" });
    await this.audit({
      eventType: "WORKFORCE_RUNTIME_RECOVERED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Uncertain work was held for recovery review and was not replayed.",
      requestId,
      ipAddress,
      metadata: { reviewRequiredCount: uncertain.length },
    });
    return this.dashboard(ownerId);
  }

  private requirementFor(task: WorkforceRuntimeTask): SpecialistRequirement {
    const text = normalized(`${task.title} ${task.objective}`);
    const domain =
      typeof task.inputs.domain === "string"
        ? task.inputs.domain
        : this.domainFromText(text);
    const taskType =
      typeof task.inputs.taskType === "string"
        ? task.inputs.taskType
        : this.taskTypeFromText(text);
    return {
      requirementId: crypto.randomUUID(),
      objectiveId:
        typeof task.inputs.objectiveExecutionId === "string"
          ? task.inputs.objectiveExecutionId
          : null,
      projectId:
        typeof task.inputs.projectId === "string" ? task.inputs.projectId : null,
      taskId: task.id,
      companyId: task.organizationId,
      departmentAffinity: task.preferredDepartmentId,
      taskType,
      domain,
      requiredSkills: task.requiredSkills,
      preferredSkills:
        typeof task.inputs.preferredSkills === "object" &&
        Array.isArray(task.inputs.preferredSkills)
          ? task.inputs.preferredSkills
              .filter((item): item is string => typeof item === "string")
              .slice(0, 30)
          : [],
      requiredCapabilities: task.requiredCapabilities,
      preferredCapabilities:
        typeof task.inputs.preferredCapabilities === "object" &&
        Array.isArray(task.inputs.preferredCapabilities)
          ? task.inputs.preferredCapabilities
              .filter((item): item is string => typeof item === "string")
              .slice(0, 30)
          : [],
      memoryRequirements: task.memoryScopeRefs,
      authorityRequirements: [],
      riskLevel: task.riskLevel,
      expectedDurationMs: 60_000,
      estimatedCost: Math.max(1, Math.min(task.economicBudget, 10)),
    };
  }

  private score(
    task: WorkforceRuntimeTask,
    requirement: SpecialistRequirement,
    agent: AgentRecord,
    account:
      | Awaited<ReturnType<AgentEconomyService["dashboard"]>>["accounts"][number]
      | undefined,
    performance:
      | Awaited<ReturnType<AgentEconomyService["dashboard"]>>["performance"][number]
      | undefined,
    activeCount: number,
  ): WorkforceMatchScore {
    const skillFit = fit(requirement.requiredSkills, [
      ...(agent.workforce?.skills ?? []),
      ...agent.supportedTasks,
      agent.workforce?.specialization ?? "",
      agent.displayName,
    ]);
    const capabilityFit = fit(requirement.requiredCapabilities, agent.capabilities);
    const domainExperience = fit(
      [requirement.domain],
      [
        ...(agent.workforce?.skills ?? []),
        agent.workforce?.specialization ?? "",
        agent.workforce?.description ?? "",
        ...agent.supportedTasks,
      ],
    );
    const historicalTaskSimilarity = fit(
      [requirement.taskType],
      [...agent.supportedTasks, ...(agent.workforce?.skills ?? []), agent.role],
    );
    const reputation = (account?.reputation ?? 0) / 100;
    const calibration = performance?.calibration ?? 0.5;
    const costEfficiency = performance
      ? Math.min(1, performance.costEfficiency / 2)
      : 0.5;
    const availability =
      activeCount === 0 && ["available", "busy"].includes(agent.status) ? 1 : 0;
    const departmentFit =
      !task.preferredDepartmentId ||
      agent.workforce?.departmentId === task.preferredDepartmentId
        ? 1
        : 0.35;
    const capacityPenalty = Math.min(1, activeCount * 0.35);
    const funded = Boolean(
      account &&
      account.economyStatus !== "SUSPENDED" &&
      account.availableCredits >= Math.max(1, Math.min(task.economicBudget, 10)),
    );
    const lifecycle = !["disabled", "unhealthy", "paused"].includes(agent.status);
    const hardRejections = [
      ...(!funded ? ["insufficient economic budget"] : []),
      ...(!lifecycle ? ["lifecycle blocked"] : []),
      ...(availability <= 0 ? ["agent unavailable"] : []),
      ...(capabilityFit < 1 ? ["missing required capability"] : []),
    ];
    const finalScore = round(
      skillFit * 0.2 +
        capabilityFit * 0.22 +
        domainExperience * 0.12 +
        historicalTaskSimilarity * 0.1 +
        reputation * 0.12 +
        calibration * 0.09 +
        costEfficiency * 0.06 +
        availability * 0.05 +
        departmentFit * 0.04 -
        capacityPenalty * 0.2,
    );
    const category = hardRejections.length
      ? "INELIGIBLE"
      : finalScore >= 0.92 && skillFit >= 0.9
        ? "EXACT_MATCH"
        : finalScore >= MATCH_THRESHOLDS.strong
          ? "STRONG_MATCH"
          : finalScore >= MATCH_THRESHOLDS.adaptable
            ? "ADAPTABLE_MATCH"
            : "WEAK_MATCH";
    const eligible =
      hardRejections.length === 0 &&
      ["EXACT_MATCH", "STRONG_MATCH", "ADAPTABLE_MATCH"].includes(category);
    return {
      agentId: agent.id,
      category,
      skillFit: round(skillFit),
      capabilityFit: round(capabilityFit),
      domainExperience: round(domainExperience),
      historicalTaskSimilarity: round(historicalTaskSimilarity),
      reputation: round(reputation),
      calibration: round(calibration),
      costEfficiency: round(costEfficiency),
      availability,
      departmentFit,
      capacityPenalty,
      finalScore,
      predictedSuccess: round(
        reputation * 0.35 +
          calibration * 0.25 +
          skillFit * 0.2 +
          domainExperience * 0.2,
      ),
      estimatedCost: Math.max(1, Math.min(task.economicBudget, 10)),
      estimatedDurationMs: 60_000,
      eligible,
      reasons: [
        funded ? "economic budget available" : "insufficient economic budget",
        lifecycle ? "lifecycle available" : "lifecycle blocked",
        capabilityFit === 1 ? "capabilities matched" : "missing required capability",
        `${category.toLowerCase().replaceAll("_", " ")} candidate`,
      ],
      rejectionReasons: hardRejections,
    };
  }

  private async resolveWorkforceGap(
    ownerId: string,
    task: WorkforceRuntimeTask,
    requirement: SpecialistRequirement,
    scores: WorkforceMatchScore[],
    requestId: string,
    ipAddress: string,
  ): Promise<WorkforceGapResolution> {
    const adaptable = scores.find(
      (score) => score.eligible && score.category === "ADAPTABLE_MATCH",
    );
    if (adaptable)
      return {
        requirement,
        decision: "ADAPT_EXISTING",
        selectedAgentId: adaptable.agentId,
        selectedCategory: adaptable.category,
        proposal: null,
        missingCapabilities: [],
        blockerCode: null,
        reasons: [
          "An existing compatible generalist can safely expand into this domain.",
        ],
      };
    const catalogMatch =
      typeof this.workforce.assignBestCatalogMatch === "function"
        ? await this.workforce.assignBestCatalogMatch({
            ownerId,
            text: `${task.title} ${task.objective} ${requirement.domain} ${requirement.taskType}`,
            requiredSkills: requirement.requiredSkills,
            requiredCapabilities: requirement.requiredCapabilities,
            requestId,
            ipAddress,
          })
        : null;
    if (catalogMatch)
      return {
        requirement,
        decision: "CATALOG_MATCH",
        selectedAgentId: catalogMatch.id,
        selectedCategory: "STRONG_MATCH",
        proposal: null,
        missingCapabilities: [],
        blockerCode: null,
        reasons: [
          "Matched an existing reusable catalog specialist and created one lightweight company assignment.",
        ],
      };
    const missingCapabilities = await this.missingGovernedCapabilities(
      ownerId,
      requirement.requiredCapabilities,
    );
    if (missingCapabilities.length) {
      await this.createCapabilityRequestIfPossible(ownerId, task, requestId, ipAddress);
      return {
        requirement,
        decision: "CAPABILITY_REQUESTED",
        selectedAgentId: null,
        selectedCategory: null,
        proposal: null,
        missingCapabilities,
        blockerCode: "CAPABILITY_MISSING",
        reasons: [`Missing governed capabilities: ${missingCapabilities.join(", ")}.`],
      };
    }
    const duplicate = scores.find(
      (score) =>
        score.finalScore >= MATCH_THRESHOLDS.duplicate && score.capabilityFit === 1,
    );
    const proposal =
      task.workforceGap?.proposal ??
      (await this.proposalFor(ownerId, task, requirement, duplicate?.agentId ?? null));
    const approval = z
      .object({ approved: z.boolean(), proposalId: z.string().uuid().optional() })
      .passthrough()
      .safeParse(task.inputs.workforceGapApproval);
    if (
      !approval.success ||
      !approval.data.approved ||
      (approval.data.proposalId && approval.data.proposalId !== proposal.proposalId)
    ) {
      await this.message(
        ownerId,
        task,
        task.createdByAgentId ?? "engineering_manager",
        null,
        "PROPOSAL",
        {
          workforceGap: {
            proposal,
            duplicateAgentId: duplicate?.agentId ?? null,
            scores: scores.slice(0, 5),
          },
        },
        task.evidenceRefs,
      );
      return {
        requirement,
        decision: "SPECIALIST_APPROVAL_PENDING",
        selectedAgentId: null,
        selectedCategory: null,
        proposal,
        missingCapabilities: [],
        blockerCode: "SPECIALIST_APPROVAL_PENDING",
        reasons: [
          duplicate
            ? `Near match ${duplicate.agentId} exists but is below automatic assignment threshold.`
            : "No sufficiently strong specialist exists; owner approval is required before creating one.",
        ],
      };
    }
    if (!this.agentFactory)
      return {
        requirement,
        decision: "BLOCKED",
        selectedAgentId: null,
        selectedCategory: null,
        proposal,
        missingCapabilities: [],
        blockerCode: "SPECIALIST_CREATION_REQUIRED",
        reasons: ["Dynamic Agent Generation service is unavailable."],
      };
    const organizationId =
      requirement.companyId ??
      (await this.workforce.society.dashboard(ownerId)).organizations[0]?.id;
    if (!organizationId || !proposal.departmentId)
      return {
        requirement,
        decision: "BLOCKED",
        selectedAgentId: null,
        selectedCategory: null,
        proposal,
        missingCapabilities: [],
        blockerCode: "SPECIALIST_CREATION_REQUIRED",
        reasons: [
          "Specialist creation requires an existing company and department scope.",
        ],
      };
    const created = await this.agentFactory.createObjectiveSpecialist({
      ownerId,
      workflowId: null,
      objective: task.objective,
      capability: requirement.domain,
      name: proposal.name,
      description: proposal.description,
      skills: proposal.skills,
      capabilities: proposal.capabilities,
      organizationId,
      departmentId: proposal.departmentId,
      departmentMemoryScopeId: `department:${proposal.departmentId}`,
      organizationMemoryScopeId: `organization:${organizationId}`,
      managerAgentId: proposal.reportsToAgentId,
      recommendation: proposal.recommendation,
      requestId,
      ipAddress,
    });
    await this.workforce.enrollGeneratedSpecialist(created.agent);
    await this.message(
      ownerId,
      task,
      created.agent.id,
      task.createdByAgentId,
      "STATUS_UPDATE",
      {
        createdSpecialist: created.agent.id,
        proposalId: proposal.proposalId,
        authorityExpanded: false,
      },
      task.evidenceRefs,
    );
    return {
      requirement,
      decision: "SPECIALIST_CREATED",
      selectedAgentId: created.agent.id,
      selectedCategory: "STRONG_MATCH",
      proposal,
      missingCapabilities: [],
      blockerCode: null,
      reasons: [
        "Owner-approved specialist created through Dynamic Agent Generation and enrolled for scheduler assignment.",
      ],
    };
  }

  private assertDelegationAuthority(
    from: AgentRecord,
    to: AgentRecord,
    type: "WORK" | "QUESTION" | "REVIEW",
  ) {
    const sameDepartment =
      from.workforce?.departmentId &&
      from.workforce.departmentId === to.workforce?.departmentId;
    const managesTarget =
      to.workforce?.managerAgentId === from.id ||
      to.workforce?.parentAgentId === from.id;
    const reviewerRequest =
      type === "REVIEW" && ["review", "security", "testing"].includes(to.role);
    if (!sameDepartment && !managesTarget && !reviewerRequest)
      throw new ExecutionError(
        403,
        "DELEGATION_AUTHORITY_DENIED",
        "Cross-department delegation requires a governed specialist review route.",
      );
  }

  private async createCapabilityRequestIfPossible(
    ownerId: string,
    task: WorkforceRuntimeTask,
    requestId: string,
    ipAddress: string,
  ) {
    if (!task.requiredCapabilities.length) return;
    await this.message(
      ownerId,
      task,
      task.createdByAgentId ?? "engineering_manager",
      null,
      "CAPABILITY_REQUEST",
      { missingCapabilities: task.requiredCapabilities },
      task.evidenceRefs,
    );
    const applicationId =
      typeof task.inputs.applicationId === "string" ? task.inputs.applicationId : null;
    if (applicationId)
      await this.capabilityStudio.createRequest({
        ownerId,
        requestId,
        ipAddress,
        body: {
          applicationId,
          requestedIntent: `Provide ${task.requiredCapabilities.join(", ")}`,
          desiredOutcome: task.objective,
          contextSummary: task.title,
          requestedBy: task.createdByAgentId ? "AGENT" : "OWNER",
          requestingAgentId: task.createdByAgentId,
        },
      });
  }

  private async missingGovernedCapabilities(ownerId: string, required: string[]) {
    if (!required.length) return [];
    const [agents, factoryCapabilities] = await Promise.all([
      this.agentStore.listAgents(ownerId),
      this.agentFactory?.capabilities(ownerId) ?? Promise.resolve([]),
    ]);
    const available = new Set(
      [
        ...agents.flatMap((agent) => agent.capabilities),
        ...factoryCapabilities.map((capability) => capability.id),
      ].map(normalized),
    );
    return required.filter((capability) => !available.has(normalized(capability)));
  }

  private async seedApprovedSpecialistBudget(
    ownerId: string,
    task: WorkforceRuntimeTask,
    agentId: string,
    requestId: string,
    ipAddress: string,
  ) {
    const amount = Math.max(1, Math.min(task.economicBudget, 10));
    await this.economy.allocate({
      ownerId,
      agentId,
      amount,
      reasonCode: "OWNER_APPROVED_SPECIALIST_TASK_RESERVE",
      idempotencyKey: `workforce-specialist-budget:${task.id}:${agentId}`,
      requestId,
      ipAddress,
    });
  }

  private async proposalFor(
    ownerId: string,
    task: WorkforceRuntimeTask,
    requirement: SpecialistRequirement,
    duplicateAgentId: string | null,
  ) {
    const society = await this.workforce.society.dashboard(ownerId);
    const organizationId =
      requirement.companyId ?? society.organizations[0]?.id ?? null;
    const preferred = requirement.departmentAffinity
      ? society.departments.find(
          (department) => department.id === requirement.departmentAffinity,
        )
      : null;
    const department =
      preferred ?? this.departmentFor(society.departments, requirement);
    if (!organizationId || !department)
      throw new ExecutionError(
        409,
        "SPECIALIST_CREATION_REQUIRED",
        "A company and department are required before proposing a generated specialist.",
      );
    const name = this.specialistName(requirement);
    const reusable = this.reusableSpecialization(requirement, task.objective);
    return {
      proposalId: crypto.randomUUID(),
      requirementId: requirement.requirementId,
      name,
      role: name,
      departmentId: department.id,
      departmentName: department.name,
      description: `${name} for ${requirement.domain.replaceAll("_", " ")} ${requirement.taskType.replaceAll("_", " ")} work.`,
      skills: [
        ...new Set([
          ...requirement.requiredSkills,
          requirement.domain,
          requirement.taskType,
        ]),
      ].slice(0, 30),
      capabilities: requirement.requiredCapabilities.length
        ? requirement.requiredCapabilities
        : ["planning", "documentation", "review"],
      missingCapabilities: [],
      memoryScope: `agent:pending:${requirement.requirementId}`,
      authority: [],
      modelPolicyId: requirement.riskLevel === "HIGH" ? "STRONG_REASONING" : "BALANCED",
      economyPolicy: "lazy_owner_or_task_activation_v1",
      reportsToAgentId: department.leadAgentId ?? duplicateAgentId,
      delegationPermissions: ["bounded_task_assignment"],
      approvalBoundaries: [
        "Cannot approve work, spend, or high-risk actions.",
        "Cannot receive capabilities that are not already governed and available.",
        "Execution still requires scheduler selection and economy reservation.",
      ],
      recommendation: reusable ? ("REUSABLE" as const) : ("TEMPORARY" as const),
      rationale: duplicateAgentId
        ? `Near-duplicate ${duplicateAgentId} exists; extending that worker is preferred unless owner approves this distinct specialist.`
        : `No sufficiently strong existing worker matched ${requirement.domain.replaceAll("_", " ")} requirements.`,
    };
  }

  private departmentFor(
    departments: Array<{ id: string; name: string; leadAgentId?: string | null }>,
    requirement: SpecialistRequirement,
  ) {
    const text = normalized(
      `${requirement.domain} ${requirement.taskType} ${requirement.requiredSkills.join(" ")}`,
    );
    const wanted =
      text.includes("lead") ||
      text.includes("sales") ||
      text.includes("outreach") ||
      text.includes("crm")
        ? "Sales"
        : text.includes("market") || text.includes("copy") || text.includes("seo")
          ? "Marketing"
          : text.includes("qa") || text.includes("test") || text.includes("review")
            ? "Quality & Review"
            : text.includes("research") || text.includes("analysis")
              ? "Research"
              : text.includes("finance")
                ? "Finance"
                : "Development";
    return (
      departments.find((department) => department.name === wanted) ??
      departments[0] ??
      null
    );
  }

  private specialistName(requirement: SpecialistRequirement) {
    const domain = requirement.domain
      .split(/[_\s]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");
    const type =
      requirement.taskType.includes("lead") || requirement.taskType.includes("prospect")
        ? "Lead Generation"
        : requirement.taskType.includes("qa") || requirement.taskType.includes("test")
          ? "QA"
          : requirement.taskType.includes("research")
            ? "Research"
            : requirement.taskType.includes("outreach")
              ? "Outbound Campaign"
              : "Operations";
    return `${domain || "Domain"} ${type} Specialist`.slice(0, 120);
  }

  private reusableSpecialization(
    requirement: SpecialistRequirement,
    objective: string,
  ) {
    const text = normalized(
      `${objective} ${requirement.domain} ${requirement.taskType}`,
    );
    return [
      "lead",
      "prospect",
      "financial",
      "finance",
      "qa",
      "seo",
      "copy",
      "frontend",
      "sales",
      "research",
      "outreach",
    ].some((needle) => text.includes(needle));
  }

  private domainFromText(text: string) {
    const pairs: Array<[string[], string]> = [
      [["hotel", "hospitality"], "hospitality"],
      [["gym", "fitness", "studio"], "fitness"],
      [["finance", "financial", "market"], "financial_research"],
      [["seo", "search engine"], "seo"],
      [["frontend", "react", "ui"], "frontend_engineering"],
      [["lead", "prospect", "outreach", "crm"], "b2b_growth"],
    ];
    return (
      pairs.find(([needles]) => needles.some((needle) => text.includes(needle)))?.[1] ??
      "general_operations"
    );
  }

  private taskTypeFromText(text: string) {
    if (text.includes("lead") || text.includes("prospect")) return "lead_generation";
    if (text.includes("outreach") || text.includes("campaign"))
      return "outreach_campaign";
    if (text.includes("qa") || text.includes("test") || text.includes("verify"))
      return "quality_review";
    if (text.includes("research") || text.includes("find") || text.includes("analyze"))
      return "research";
    if (text.includes("write") || text.includes("copy")) return "copywriting";
    return "bounded_work";
  }
  private async message(
    ownerId: string,
    task: WorkforceRuntimeTask,
    fromAgentId: string,
    toAgentId: string | null,
    type:
      | "TASK"
      | "RESULT"
      | "QUESTION"
      | "ANSWER"
      | "DELEGATION"
      | "REVIEW_REQUEST"
      | "REVIEW_RESULT"
      | "CAPABILITY_REQUEST"
      | "ESCALATION"
      | "PROPOSAL"
      | "EVIDENCE"
      | "STATUS_UPDATE",
    payload: Record<string, unknown>,
    evidenceRefs: string[],
  ) {
    const message = WorkforceRuntimeMessageSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      organizationId: task.organizationId,
      fromAgentId,
      toAgentId,
      taskId: task.id,
      type,
      payload,
      evidenceRefs,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveMessage(message);
    return message;
  }
  private async update(
    task: WorkforceRuntimeTask,
    patch: Partial<WorkforceRuntimeTask>,
  ) {
    const updated = WorkforceRuntimeTaskSchema.parse({
      ...task,
      ...patch,
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveTask(updated);
    await this.lifecycleSink?.handleWorkforceTaskChanged(updated);
    return updated;
  }
  private async requireTask(ownerId: string, id: string) {
    const task = await this.store.findTask(ownerId, id);
    if (!task)
      throw new ExecutionError(
        404,
        "WORKFORCE_TASK_NOT_FOUND",
        "Workforce task not found.",
      );
    return task;
  }
  private async requireAgent(ownerId: string, id: string) {
    const agent = await this.agentStore.findAgent(ownerId, id);
    if (!agent?.workforce)
      throw new ExecutionError(
        404,
        "WORKFORCE_AGENT_NOT_FOUND",
        "Workforce agent not found.",
      );
    return agent;
  }
  private metrics(ownerId: string) {
    const existing = this.#metrics.get(ownerId);
    if (existing) return existing;
    const created = {
      assignments: 0,
      providerCalls: 0,
      matchingLatencyTotalMs: 0,
      peakActiveAgents: 0,
    };
    this.#metrics.set(ownerId, created);
    return created;
  }
  private auditEvent(
    input: { ownerId: string; requestId: string; ipAddress: string },
    eventType: "WORKFORCE_TASK_CREATED",
    reason: string,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    return this.audit({
      eventType,
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      metadata,
    });
  }
}
