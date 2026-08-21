import {
  AgentConsensusRecordSchema,
  AgentConflictRecordSchema,
  AgentContextRecordSchema,
  AgentHealthRecordSchema,
  AgentMessageRecordSchema,
  AgentMetricsRecordSchema,
  AgentLifecycleEventRecordSchema,
  AgentPromotionCandidateRecordSchema,
  AgentRecordSchema,
  AgentTemplateRecordSchema,
  AgentTaskRecordSchema,
  CapabilityRecordSchema,
  DynamicAgentPerformanceRecordSchema,
  DynamicAgentRecordSchema,
  TeamCompositionRecordSchema,
  type AgentConsensusRecord,
  type AgentConflictRecord,
  type AgentContextRecord,
  type AgentHealthRecord,
  type AgentLifecycleEventRecord,
  type AgentMessageRecord,
  type AgentMetricsRecord,
  type AgentPromotionCandidateRecord,
  type AgentRecord,
  type AgentTemplateRecord,
  type AgentTaskRecord,
  type CapabilityRecord,
  type DynamicAgentPerformanceRecord,
  type DynamicAgentRecord,
  type TeamCompositionRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AgentStore {
  upsertAgent(agent: AgentRecord): Awaitable<void>;
  findAgent(ownerId: string, agentId: string): Awaitable<AgentRecord | undefined>;
  listAgents(ownerId: string): Awaitable<AgentRecord[]>;
  saveTask(task: AgentTaskRecord): Awaitable<void>;
  listTasks(ownerId: string, limit: number): Awaitable<AgentTaskRecord[]>;
  findTask(ownerId: string, taskId: string): Awaitable<AgentTaskRecord | undefined>;
  saveMessage(message: AgentMessageRecord): Awaitable<void>;
  listMessages(ownerId: string, limit: number): Awaitable<AgentMessageRecord[]>;
  saveContext(context: AgentContextRecord): Awaitable<void>;
  listContexts(ownerId: string, limit: number): Awaitable<AgentContextRecord[]>;
  saveConsensus(consensus: AgentConsensusRecord): Awaitable<void>;
  listConsensus(ownerId: string, limit: number): Awaitable<AgentConsensusRecord[]>;
  saveConflict(conflict: AgentConflictRecord): Awaitable<void>;
  listConflicts(ownerId: string, limit: number): Awaitable<AgentConflictRecord[]>;
  saveHealth(health: AgentHealthRecord): Awaitable<void>;
  listHealth(ownerId: string): Awaitable<AgentHealthRecord[]>;
  saveMetrics(metrics: AgentMetricsRecord): Awaitable<void>;
  listMetrics(ownerId: string): Awaitable<AgentMetricsRecord[]>;
  saveTemplate(template: AgentTemplateRecord): Awaitable<void>;
  listTemplates(ownerId: string): Awaitable<AgentTemplateRecord[]>;
  saveCapability(capability: CapabilityRecord): Awaitable<void>;
  listCapabilities(ownerId: string): Awaitable<CapabilityRecord[]>;
  searchCapabilities(
    ownerId: string,
    query: string,
    limit: number,
  ): Awaitable<CapabilityRecord[]>;
  saveDynamicAgent(agent: DynamicAgentRecord): Awaitable<void>;
  findDynamicAgent(
    ownerId: string,
    agentId: string,
  ): Awaitable<DynamicAgentRecord | undefined>;
  listDynamicAgents(
    ownerId: string,
    includeArchived: boolean,
  ): Awaitable<DynamicAgentRecord[]>;
  saveLifecycleEvent(event: AgentLifecycleEventRecord): Awaitable<void>;
  listLifecycleEvents(
    ownerId: string,
    limit: number,
  ): Awaitable<AgentLifecycleEventRecord[]>;
  saveDynamicPerformance(performance: DynamicAgentPerformanceRecord): Awaitable<void>;
  listDynamicPerformance(
    ownerId: string,
    limit: number,
  ): Awaitable<DynamicAgentPerformanceRecord[]>;
  saveTeamComposition(composition: TeamCompositionRecord): Awaitable<void>;
  listTeamCompositions(
    ownerId: string,
    limit: number,
  ): Awaitable<TeamCompositionRecord[]>;
  savePromotionCandidate(candidate: AgentPromotionCandidateRecord): Awaitable<void>;
  listPromotionCandidates(
    ownerId: string,
    limit: number,
  ): Awaitable<AgentPromotionCandidateRecord[]>;
}

export class InMemoryAgentStore implements AgentStore {
  readonly #agents = new Map<string, AgentRecord>();
  readonly #tasks = new Map<string, AgentTaskRecord>();
  readonly #messages = new Map<string, AgentMessageRecord>();
  readonly #contexts = new Map<string, AgentContextRecord>();
  readonly #consensus = new Map<string, AgentConsensusRecord>();
  readonly #conflicts = new Map<string, AgentConflictRecord>();
  readonly #health = new Map<string, AgentHealthRecord>();
  readonly #metrics = new Map<string, AgentMetricsRecord>();
  readonly #templates = new Map<string, AgentTemplateRecord>();
  readonly #capabilities = new Map<string, CapabilityRecord>();
  readonly #dynamicAgents = new Map<string, DynamicAgentRecord>();
  readonly #lifecycle = new Map<string, AgentLifecycleEventRecord>();
  readonly #dynamicPerformance = new Map<string, DynamicAgentPerformanceRecord>();
  readonly #teamCompositions = new Map<string, TeamCompositionRecord>();
  readonly #promotionCandidates = new Map<string, AgentPromotionCandidateRecord>();

  upsertAgent(agent: AgentRecord) {
    const parsed = AgentRecordSchema.parse(agent);
    this.#agents.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  findAgent(ownerId: string, agentId: string) {
    const agent = this.#agents.get(`${ownerId}:${agentId}`);
    return agent ? structuredClone(agent) : undefined;
  }

  listAgents(ownerId: string) {
    return [...this.#agents.values()]
      .filter((agent) => agent.ownerId === ownerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((agent) => structuredClone(agent));
  }

  saveTask(task: AgentTaskRecord) {
    const parsed = AgentTaskRecordSchema.parse(task);
    this.#tasks.set(parsed.id, structuredClone(parsed));
  }

  listTasks(ownerId: string, limit: number) {
    return [...this.#tasks.values()]
      .filter((task) => task.ownerId === ownerId)
      .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt))
      .slice(0, limit)
      .map((task) => structuredClone(task));
  }

  findTask(ownerId: string, taskId: string) {
    const task = this.#tasks.get(taskId);
    return task?.ownerId === ownerId ? structuredClone(task) : undefined;
  }

  saveMessage(message: AgentMessageRecord) {
    const parsed = AgentMessageRecordSchema.parse(message);
    this.#messages.set(parsed.id, structuredClone(parsed));
  }

  listMessages(ownerId: string, limit: number) {
    return [...this.#messages.values()]
      .filter((message) => message.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((message) => structuredClone(message));
  }

  saveContext(context: AgentContextRecord) {
    const parsed = AgentContextRecordSchema.parse(context);
    this.#contexts.set(parsed.id, structuredClone(parsed));
  }

  listContexts(ownerId: string, limit: number) {
    return [...this.#contexts.values()]
      .filter((context) => context.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((context) => structuredClone(context));
  }

  saveConsensus(consensus: AgentConsensusRecord) {
    const parsed = AgentConsensusRecordSchema.parse(consensus);
    this.#consensus.set(parsed.id, structuredClone(parsed));
  }

  listConsensus(ownerId: string, limit: number) {
    return [...this.#consensus.values()]
      .filter((consensus) => consensus.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((consensus) => structuredClone(consensus));
  }

  saveConflict(conflict: AgentConflictRecord) {
    const parsed = AgentConflictRecordSchema.parse(conflict);
    this.#conflicts.set(parsed.id, structuredClone(parsed));
  }

  listConflicts(ownerId: string, limit: number) {
    return [...this.#conflicts.values()]
      .filter((conflict) => conflict.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((conflict) => structuredClone(conflict));
  }

  saveHealth(health: AgentHealthRecord) {
    const parsed = AgentHealthRecordSchema.parse(health);
    this.#health.set(`${parsed.ownerId}:${parsed.agentId}`, structuredClone(parsed));
  }

  listHealth(ownerId: string) {
    return [...this.#health.values()]
      .filter((health) => health.ownerId === ownerId)
      .map((health) => structuredClone(health));
  }

  saveMetrics(metrics: AgentMetricsRecord) {
    const parsed = AgentMetricsRecordSchema.parse(metrics);
    this.#metrics.set(`${parsed.ownerId}:${parsed.agentId}`, structuredClone(parsed));
  }

  listMetrics(ownerId: string) {
    return [...this.#metrics.values()]
      .filter((metrics) => metrics.ownerId === ownerId)
      .map((metrics) => structuredClone(metrics));
  }

  saveTemplate(template: AgentTemplateRecord) {
    const parsed = AgentTemplateRecordSchema.parse(template);
    this.#templates.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  listTemplates(ownerId: string) {
    return [...this.#templates.values()]
      .filter((template) => template.ownerId === ownerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((template) => structuredClone(template));
  }

  saveCapability(capability: CapabilityRecord) {
    const parsed = CapabilityRecordSchema.parse(capability);
    this.#capabilities.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  listCapabilities(ownerId: string) {
    return [...this.#capabilities.values()]
      .filter((capability) => capability.ownerId === ownerId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((capability) => structuredClone(capability));
  }

  searchCapabilities(ownerId: string, query: string, limit: number) {
    const needle = query.toLowerCase();
    return [...this.#capabilities.values()]
      .filter((capability) => capability.ownerId === ownerId)
      .filter(
        (capability) =>
          capability.id.toLowerCase().includes(needle) ||
          capability.name.toLowerCase().includes(needle) ||
          capability.description.toLowerCase().includes(needle),
      )
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, limit)
      .map((capability) => structuredClone(capability));
  }

  saveDynamicAgent(agent: DynamicAgentRecord) {
    const parsed = DynamicAgentRecordSchema.parse(agent);
    this.#dynamicAgents.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  findDynamicAgent(ownerId: string, agentId: string) {
    const agent = this.#dynamicAgents.get(`${ownerId}:${agentId}`);
    return agent ? structuredClone(agent) : undefined;
  }

  listDynamicAgents(ownerId: string, includeArchived: boolean) {
    return [...this.#dynamicAgents.values()]
      .filter((agent) => agent.ownerId === ownerId)
      .filter((agent) => includeArchived || agent.lifecycleStatus !== "archived")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((agent) => structuredClone(agent));
  }

  saveLifecycleEvent(event: AgentLifecycleEventRecord) {
    const parsed = AgentLifecycleEventRecordSchema.parse(event);
    this.#lifecycle.set(parsed.id, structuredClone(parsed));
  }

  listLifecycleEvents(ownerId: string, limit: number) {
    return [...this.#lifecycle.values()]
      .filter((event) => event.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  saveDynamicPerformance(performance: DynamicAgentPerformanceRecord) {
    const parsed = DynamicAgentPerformanceRecordSchema.parse(performance);
    this.#dynamicPerformance.set(parsed.id, structuredClone(parsed));
  }

  listDynamicPerformance(ownerId: string, limit: number) {
    return [...this.#dynamicPerformance.values()]
      .filter((performance) => performance.ownerId === ownerId)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, limit)
      .map((performance) => structuredClone(performance));
  }

  saveTeamComposition(composition: TeamCompositionRecord) {
    const parsed = TeamCompositionRecordSchema.parse(composition);
    this.#teamCompositions.set(parsed.id, structuredClone(parsed));
  }

  listTeamCompositions(ownerId: string, limit: number) {
    return [...this.#teamCompositions.values()]
      .filter((composition) => composition.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((composition) => structuredClone(composition));
  }

  savePromotionCandidate(candidate: AgentPromotionCandidateRecord) {
    const parsed = AgentPromotionCandidateRecordSchema.parse(candidate);
    this.#promotionCandidates.set(parsed.id, structuredClone(parsed));
  }

  listPromotionCandidates(ownerId: string, limit: number) {
    return [...this.#promotionCandidates.values()]
      .filter((candidate) => candidate.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((candidate) => structuredClone(candidate));
  }
}
