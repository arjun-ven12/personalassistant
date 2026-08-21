import {
  AgentConsensusResponseSchema,
  AgentConsensusRecordSchema,
  AgentDashboardResponseSchema,
  AgentMessageResponseSchema,
  AgentTaskRecordSchema,
  AgentTaskResponseSchema,
  CreateAgentConsensusRequestSchema,
  CreateAgentMessageRequestSchema,
  CreateAgentTaskRequestSchema,
  type AgentRecord,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentFactoryService } from "./factory.js";
import { BUILT_IN_AGENTS, builtInAgentRecord } from "./builtins.js";
import type { AgentStore } from "./store.js";

export class AgentRegistryService {
  constructor(
    readonly store: AgentStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly factory?: AgentFactoryService,
  ) {}

  async ensureBuiltIns(ownerId: string, requestId = "system") {
    const at = this.now().toISOString();
    const existing = new Set(
      (await this.store.listAgents(ownerId)).map((agent) => agent.id),
    );
    for (const builtin of BUILT_IN_AGENTS) {
      if (existing.has(builtin.id)) continue;
      const agent = builtInAgentRecord(builtin, ownerId, at);
      await this.store.upsertAgent(agent);
      await this.store.saveHealth({
        ownerId,
        agentId: agent.id,
        state: "healthy",
        checkedAt: at,
        activeTaskCount: 0,
        messageBacklog: 0,
        reasonCode: "READY",
      });
      await this.store.saveMetrics({
        ownerId,
        agentId: agent.id,
        assignedTaskCount: 0,
        completedTaskCount: 0,
        failedTaskCount: 0,
        messageCount: 0,
        consensusVoteCount: 0,
        lastActivityAt: null,
      });
      await this.audit({
        eventType: "AGENT_REGISTERED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: `${agent.displayName} registered.`,
        requestId,
        metadata: { agentId: agent.id, role: agent.role },
      });
    }
  }

  async dashboard(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    const dynamicWorkforce = await this.factory?.dashboard(ownerId);
    return AgentDashboardResponseSchema.parse({
      agents: await this.store.listAgents(ownerId),
      tasks: await this.store.listTasks(ownerId, 100),
      messages: await this.store.listMessages(ownerId, 100),
      contexts: await this.store.listContexts(ownerId, 50),
      consensus: await this.store.listConsensus(ownerId, 50),
      conflicts: await this.store.listConflicts(ownerId, 50),
      health: await this.store.listHealth(ownerId),
      metrics: await this.store.listMetrics(ownerId),
      ...(dynamicWorkforce ? { dynamicWorkforce } : {}),
    });
  }

  async list(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    return this.store.listAgents(ownerId);
  }

  async assignTask(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltIns(input.ownerId, input.requestId);
    const parsed = CreateAgentTaskRequestSchema.parse(input.body);
    const agent = await this.requireAgent(input.ownerId, parsed.agentId);
    if (agent.status === "disabled" || agent.status === "unhealthy") {
      throw new ExecutionError(
        403,
        "AGENT_NOT_AVAILABLE",
        "The requested agent is not available.",
      );
    }
    const at = this.now().toISOString();
    const task = AgentTaskRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      workflowId: parsed.workflowId ?? null,
      title: parsed.title,
      objective: parsed.objective,
      status: "assigned",
      priority: parsed.priority,
      dependencies: [],
      repositoryIds: parsed.repositoryIds,
      evidence: parsed.evidence,
      assignedAt: at,
      updatedAt: at,
      completedAt: null,
      resultSummary: null,
    });
    await this.store.saveTask(task);
    await this.store.saveMessage({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      senderAgentId: "engineering_manager",
      recipientAgentId: agent.id,
      conversationId: crypto.randomUUID(),
      workflowId: task.workflowId,
      taskId: task.id,
      messageType: "assignment",
      payload: { title: task.title, objective: task.objective },
      evidence: task.evidence,
      priority: task.priority,
      createdAt: at,
    });
    await this.audit({
      eventType: "AGENT_TASK_ASSIGNED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `${agent.displayName} assigned ${task.title}.`,
      requestId: input.requestId,
      metadata: { agentId: agent.id, taskId: task.id },
    });
    return AgentTaskResponseSchema.parse({ task });
  }

  async completeTask(input: {
    ownerId: string;
    taskId: string;
    resultSummary: string;
    requestId: string;
    ipAddress: string;
  }) {
    const existing = await this.store.findTask(input.ownerId, input.taskId);
    if (!existing)
      throw new ExecutionError(404, "AGENT_TASK_NOT_FOUND", "Agent task not found.");
    const at = this.now().toISOString();
    const task = {
      ...existing,
      status: "completed",
      updatedAt: at,
      completedAt: at,
      resultSummary: input.resultSummary,
    } as const;
    await this.store.saveTask(task);
    await this.audit({
      eventType: "AGENT_TASK_COMPLETED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent task completed.",
      requestId: input.requestId,
      metadata: { agentId: task.agentId, taskId: task.id },
    });
    return AgentTaskResponseSchema.parse({ task });
  }

  async sendMessage(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltIns(input.ownerId, input.requestId);
    const parsed = CreateAgentMessageRequestSchema.parse(input.body);
    await this.requireAgent(input.ownerId, parsed.senderAgentId);
    await this.requireAgent(input.ownerId, parsed.recipientAgentId);
    const message = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      senderAgentId: parsed.senderAgentId,
      recipientAgentId: parsed.recipientAgentId,
      conversationId: parsed.conversationId ?? crypto.randomUUID(),
      workflowId: parsed.workflowId ?? null,
      taskId: parsed.taskId ?? null,
      messageType: parsed.messageType,
      payload: parsed.payload,
      evidence: parsed.evidence,
      priority: parsed.priority,
      createdAt: this.now().toISOString(),
    };
    await this.store.saveMessage(message);
    await this.audit({
      eventType: "AGENT_MESSAGE_SENT",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `${message.senderAgentId} sent ${message.messageType}.`,
      requestId: input.requestId,
      metadata: {
        senderAgentId: message.senderAgentId,
        recipientAgentId: message.recipientAgentId,
        messageType: message.messageType,
      },
    });
    return AgentMessageResponseSchema.parse({ message });
  }

  async createConsensus(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltIns(input.ownerId, input.requestId);
    const parsed = CreateAgentConsensusRequestSchema.parse(input.body);
    for (const agentId of parsed.requiredAgentIds) {
      await this.requireAgent(input.ownerId, agentId);
    }
    const at = this.now().toISOString();
    const consensus = AgentConsensusRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      workflowId: parsed.workflowId ?? null,
      taskId: parsed.taskId ?? null,
      topic: parsed.topic,
      rule: parsed.rule,
      requiredAgentIds: parsed.requiredAgentIds,
      votes: [],
      status: "open",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveConsensus(consensus);
    await this.audit({
      eventType: "AGENT_CONSENSUS_OPENED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `Consensus opened for ${consensus.topic}.`,
      requestId: input.requestId,
      metadata: { consensusId: consensus.id, rule: consensus.rule },
    });
    return AgentConsensusResponseSchema.parse({ consensus });
  }

  async createSharedContext(input: {
    ownerId: string;
    title: string;
    summary: string;
    sourceRefs?: string[];
    contextType?:
      | "repository"
      | "architecture"
      | "workflow"
      | "execution"
      | "validation"
      | "conclusion";
    requestId: string;
    ipAddress: string;
  }) {
    const context = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      contextType: input.contextType ?? "conclusion",
      version: 1,
      title: input.title,
      summary: input.summary,
      sourceRefs: input.sourceRefs ?? [],
      createdAt: this.now().toISOString(),
    } as const;
    await this.store.saveContext(context);
    await this.audit({
      eventType: "AGENT_CONTEXT_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `Agent context created: ${context.title}.`,
      requestId: input.requestId,
      metadata: { contextId: context.id, contextType: context.contextType },
    });
    return context;
  }

  private async requireAgent(ownerId: string, agentId: string): Promise<AgentRecord> {
    const agent = await this.store.findAgent(ownerId, agentId);
    if (!agent)
      throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent was not found.");
    return agent;
  }
}
