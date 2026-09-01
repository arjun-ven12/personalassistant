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
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
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
  type AgentDefinition,
  type CompanyAgentAssignment,
  type TeamCompositionRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";
import {
  assignmentFromAgent,
  definitionFromAgent,
  resolvedAgent,
} from "./catalog-model.js";

const scopedKey = (ownerId: string, id: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:${id}`;
const scopedPrefix = (ownerId: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
const scopedValues = <T extends { ownerId: string }>(
  values: Map<string, T>,
  ownerId: string,
) =>
  [...values.entries()]
    .filter(
      ([key, value]) =>
        key.startsWith(scopedPrefix(ownerId)) && value.ownerId === ownerId,
    )
    .map(([, value]) => value);

export interface AgentStore {
  upsertDefinition(definition: AgentDefinition): Awaitable<void>;
  findDefinition(
    ownerId: string,
    definitionId: string,
  ): Awaitable<AgentDefinition | undefined>;
  listDefinitions(ownerId: string): Awaitable<AgentDefinition[]>;
  saveAssignment(assignment: CompanyAgentAssignment): Awaitable<void>;
  findAssignment(
    ownerId: string,
    definitionId: string,
    companyId?: string,
  ): Awaitable<CompanyAgentAssignment | undefined>;
  listAssignments(
    ownerId: string,
    companyId?: string,
  ): Awaitable<CompanyAgentAssignment[]>;
  countDefinitionAssignments(ownerId: string, definitionId: string): Awaitable<number>;
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
  readonly #definitions = new Map<string, AgentDefinition>();
  readonly #assignments = new Map<string, CompanyAgentAssignment>();
  readonly #definitionTemplates = new Map<string, AgentRecord>();
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

  upsertDefinition(definition: AgentDefinition) {
    const parsed = AgentDefinitionSchema.parse(definition);
    const duplicate = [...this.#definitions.values()].find(
      (item) =>
        item.ownerId === parsed.ownerId &&
        item.canonicalKey === parsed.canonicalKey &&
        item.id !== parsed.id,
    );
    if (duplicate)
      throw new Error("A semantically equivalent agent definition already exists.");
    this.#definitions.set(`${parsed.ownerId}:${parsed.id}`, structuredClone(parsed));
  }

  findDefinition(ownerId: string, definitionId: string) {
    const definition = this.#definitions.get(`${ownerId}:${definitionId}`);
    return definition ? structuredClone(definition) : undefined;
  }

  listDefinitions(ownerId: string) {
    return [...this.#definitions.values()]
      .filter((definition) => definition.ownerId === ownerId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((definition) => structuredClone(definition));
  }

  saveAssignment(assignment: CompanyAgentAssignment) {
    const parsed = CompanyAgentAssignmentSchema.parse(assignment);
    const definition = this.#definitions.get(
      `${parsed.ownerId}:${parsed.agentDefinitionId}`,
    );
    if (!definition) throw new Error("Agent definition does not exist.");
    this.#assignments.set(
      `${parsed.ownerId}:${parsed.companyId}:${parsed.agentDefinitionId}`,
      structuredClone(parsed),
    );
  }

  findAssignment(ownerId: string, definitionId: string, companyId?: string) {
    const targetCompanyId = companyId ?? companyScope.companyId(ownerId) ?? ownerId;
    const assignment = this.#assignments.get(
      `${ownerId}:${targetCompanyId}:${definitionId}`,
    );
    return assignment ? structuredClone(assignment) : undefined;
  }

  listAssignments(ownerId: string, companyId?: string) {
    const targetCompanyId = companyId ?? companyScope.companyId(ownerId) ?? ownerId;
    return [...this.#assignments.values()]
      .filter(
        (assignment) =>
          assignment.ownerId === ownerId && assignment.companyId === targetCompanyId,
      )
      .sort((left, right) =>
        left.agentDefinitionId.localeCompare(right.agentDefinitionId),
      )
      .map((assignment) => structuredClone(assignment));
  }

  countDefinitionAssignments(ownerId: string, definitionId: string) {
    return [...this.#assignments.values()].filter(
      (assignment) =>
        assignment.ownerId === ownerId &&
        assignment.agentDefinitionId === definitionId &&
        assignment.status !== "REVOKED",
    ).length;
  }

  upsertAgent(agent: AgentRecord) {
    const parsed = AgentRecordSchema.parse(agent);
    const companyId = companyScope.companyId(parsed.ownerId) ?? parsed.ownerId;
    this.upsertDefinition(definitionFromAgent(parsed));
    this.saveAssignment(assignmentFromAgent(parsed, companyId));
    this.#definitionTemplates.set(
      `${parsed.ownerId}:${parsed.id}`,
      structuredClone(parsed),
    );
  }

  findAgent(ownerId: string, agentId: string) {
    const definition = this.#definitions.get(`${ownerId}:${agentId}`);
    const assignment = this.findAssignment(ownerId, agentId);
    if (!definition || !assignment || assignment.status === "REVOKED") return undefined;
    return resolvedAgent(
      definition,
      assignment,
      this.#definitionTemplates.get(`${ownerId}:${agentId}`),
    );
  }

  listAgents(ownerId: string) {
    return this.listAssignments(ownerId)
      .filter((assignment) => assignment.status !== "REVOKED")
      .map((assignment) => {
        const definition = this.#definitions.get(
          `${ownerId}:${assignment.agentDefinitionId}`,
        );
        return definition
          ? resolvedAgent(
              definition,
              assignment,
              this.#definitionTemplates.get(
                `${ownerId}:${assignment.agentDefinitionId}`,
              ),
            )
          : null;
      })
      .filter((agent): agent is AgentRecord => Boolean(agent))
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((agent) => structuredClone(agent));
  }

  saveTask(task: AgentTaskRecord) {
    const parsed = AgentTaskRecordSchema.parse(task);
    this.#tasks.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listTasks(ownerId: string, limit: number) {
    return [...this.#tasks.entries()]
      .filter(
        ([key, task]) =>
          key.startsWith(scopedPrefix(ownerId)) && task.ownerId === ownerId,
      )
      .map(([, task]) => task)
      .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt))
      .slice(0, limit)
      .map((task) => structuredClone(task));
  }

  findTask(ownerId: string, taskId: string) {
    const task = this.#tasks.get(scopedKey(ownerId, taskId));
    return task?.ownerId === ownerId ? structuredClone(task) : undefined;
  }

  saveMessage(message: AgentMessageRecord) {
    const parsed = AgentMessageRecordSchema.parse(message);
    this.#messages.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listMessages(ownerId: string, limit: number) {
    return scopedValues(this.#messages, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((message) => structuredClone(message));
  }

  saveContext(context: AgentContextRecord) {
    const parsed = AgentContextRecordSchema.parse(context);
    this.#contexts.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listContexts(ownerId: string, limit: number) {
    return scopedValues(this.#contexts, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((context) => structuredClone(context));
  }

  saveConsensus(consensus: AgentConsensusRecord) {
    const parsed = AgentConsensusRecordSchema.parse(consensus);
    this.#consensus.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listConsensus(ownerId: string, limit: number) {
    return scopedValues(this.#consensus, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((consensus) => structuredClone(consensus));
  }

  saveConflict(conflict: AgentConflictRecord) {
    const parsed = AgentConflictRecordSchema.parse(conflict);
    this.#conflicts.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listConflicts(ownerId: string, limit: number) {
    return scopedValues(this.#conflicts, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((conflict) => structuredClone(conflict));
  }

  saveHealth(health: AgentHealthRecord) {
    const parsed = AgentHealthRecordSchema.parse(health);
    this.#health.set(
      scopedKey(parsed.ownerId, parsed.agentId),
      structuredClone(parsed),
    );
  }

  listHealth(ownerId: string) {
    return scopedValues(this.#health, ownerId).map((health) => structuredClone(health));
  }

  saveMetrics(metrics: AgentMetricsRecord) {
    const parsed = AgentMetricsRecordSchema.parse(metrics);
    this.#metrics.set(
      scopedKey(parsed.ownerId, parsed.agentId),
      structuredClone(parsed),
    );
  }

  listMetrics(ownerId: string) {
    return scopedValues(this.#metrics, ownerId).map((metrics) =>
      structuredClone(metrics),
    );
  }

  saveTemplate(template: AgentTemplateRecord) {
    const parsed = AgentTemplateRecordSchema.parse(template);
    this.#templates.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listTemplates(ownerId: string) {
    return scopedValues(this.#templates, ownerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((template) => structuredClone(template));
  }

  saveCapability(capability: CapabilityRecord) {
    const parsed = CapabilityRecordSchema.parse(capability);
    this.#capabilities.set(
      scopedKey(parsed.ownerId, parsed.id),
      structuredClone(parsed),
    );
  }

  listCapabilities(ownerId: string) {
    return [...this.#capabilities.entries()]
      .filter(
        ([key, capability]) =>
          key.startsWith(scopedPrefix(ownerId)) && capability.ownerId === ownerId,
      )
      .map(([, capability]) => capability)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((capability) => structuredClone(capability));
  }

  searchCapabilities(ownerId: string, query: string, limit: number) {
    const needle = query.toLowerCase();
    return [...this.#capabilities.entries()]
      .filter(
        ([key, capability]) =>
          key.startsWith(scopedPrefix(ownerId)) && capability.ownerId === ownerId,
      )
      .map(([, capability]) => capability)
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
    this.#dynamicAgents.set(
      scopedKey(parsed.ownerId, parsed.id),
      structuredClone(parsed),
    );
  }

  findDynamicAgent(ownerId: string, agentId: string) {
    const agent = this.#dynamicAgents.get(scopedKey(ownerId, agentId));
    return agent ? structuredClone(agent) : undefined;
  }

  listDynamicAgents(ownerId: string, includeArchived: boolean) {
    return [...this.#dynamicAgents.entries()]
      .filter(
        ([key, agent]) =>
          key.startsWith(scopedPrefix(ownerId)) && agent.ownerId === ownerId,
      )
      .map(([, agent]) => agent)
      .filter((agent) => includeArchived || agent.lifecycleStatus !== "archived")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((agent) => structuredClone(agent));
  }

  saveLifecycleEvent(event: AgentLifecycleEventRecord) {
    const parsed = AgentLifecycleEventRecordSchema.parse(event);
    this.#lifecycle.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listLifecycleEvents(ownerId: string, limit: number) {
    return scopedValues(this.#lifecycle, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  saveDynamicPerformance(performance: DynamicAgentPerformanceRecord) {
    const parsed = DynamicAgentPerformanceRecordSchema.parse(performance);
    this.#dynamicPerformance.set(
      scopedKey(parsed.ownerId, parsed.id),
      structuredClone(parsed),
    );
  }

  listDynamicPerformance(ownerId: string, limit: number) {
    return scopedValues(this.#dynamicPerformance, ownerId)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, limit)
      .map((performance) => structuredClone(performance));
  }

  saveTeamComposition(composition: TeamCompositionRecord) {
    const parsed = TeamCompositionRecordSchema.parse(composition);
    this.#teamCompositions.set(
      scopedKey(parsed.ownerId, parsed.id),
      structuredClone(parsed),
    );
  }

  listTeamCompositions(ownerId: string, limit: number) {
    return scopedValues(this.#teamCompositions, ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((composition) => structuredClone(composition));
  }

  savePromotionCandidate(candidate: AgentPromotionCandidateRecord) {
    const parsed = AgentPromotionCandidateRecordSchema.parse(candidate);
    this.#promotionCandidates.set(
      scopedKey(parsed.ownerId, parsed.id),
      structuredClone(parsed),
    );
  }

  listPromotionCandidates(ownerId: string, limit: number) {
    return scopedValues(this.#promotionCandidates, ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((candidate) => structuredClone(candidate));
  }
}
