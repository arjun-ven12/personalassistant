import {
  AgentMemoryRecordSchema,
  EngineeringDecisionRecordSchema,
  KnowledgeEdgeSchema,
  KnowledgeNodeSchema,
  LearningEventRecordSchema,
  MemoryRecordSchema,
  MemorySuggestionRecordSchema,
  MemoryTimelineEventSchema,
  RepositoryMemoryRecordSchema,
  type AgentMemoryRecord,
  type EngineeringDecisionRecord,
  type KnowledgeEdge,
  type KnowledgeNode,
  type LearningEventRecord,
  type MemoryRecord,
  type MemorySearchQuery,
  type MemorySuggestionRecord,
  type MemoryTimelineEvent,
  type RepositoryMemoryRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export interface MemoryStore {
  saveMemory(memory: MemoryRecord): Awaitable<void>;
  findMemory(ownerId: string, memoryId: string): Awaitable<MemoryRecord | undefined>;
  listMemories(ownerId: string, limit: number): Awaitable<MemoryRecord[]>;
  searchMemories(ownerId: string, query: MemorySearchQuery): Awaitable<MemoryRecord[]>;
  saveKnowledgeNode(node: KnowledgeNode): Awaitable<void>;
  listKnowledgeNodes(ownerId: string, limit: number): Awaitable<KnowledgeNode[]>;
  saveKnowledgeEdge(edge: KnowledgeEdge): Awaitable<void>;
  listKnowledgeEdges(ownerId: string, limit: number): Awaitable<KnowledgeEdge[]>;
  saveDecision(decision: EngineeringDecisionRecord): Awaitable<void>;
  listDecisions(ownerId: string, limit: number): Awaitable<EngineeringDecisionRecord[]>;
  saveRepositoryMemory(memory: RepositoryMemoryRecord): Awaitable<void>;
  getRepositoryMemory(
    ownerId: string,
    repositoryId: string,
  ): Awaitable<RepositoryMemoryRecord | undefined>;
  saveAgentMemory(memory: AgentMemoryRecord): Awaitable<void>;
  getAgentMemory(
    ownerId: string,
    agentId: string,
  ): Awaitable<AgentMemoryRecord | undefined>;
  saveLearningEvent(event: LearningEventRecord): Awaitable<void>;
  listLearningEvents(ownerId: string, limit: number): Awaitable<LearningEventRecord[]>;
  saveSuggestion(suggestion: MemorySuggestionRecord): Awaitable<void>;
  listSuggestions(ownerId: string, limit: number): Awaitable<MemorySuggestionRecord[]>;
  saveTimelineEvent(event: MemoryTimelineEvent): Awaitable<void>;
  listTimeline(ownerId: string, limit: number): Awaitable<MemoryTimelineEvent[]>;
}

const descending = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map((item) => structuredClone(item));

const searchableText = (memory: MemoryRecord) =>
  [
    memory.title,
    memory.summary,
    memory.content,
    memory.tags.join(" "),
    memory.evidence.map((evidence) => evidence.reference).join(" "),
  ]
    .join(" ")
    .toLowerCase();

const scopedKey = (ownerId: string, id: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:${id}`;
const scopedPrefix = (ownerId: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
const scopedValues = <T extends { ownerId: string }>(values: Map<string, T>, ownerId: string) =>
  [...values.entries()]
    .filter(([key, value]) => key.startsWith(scopedPrefix(ownerId)) && value.ownerId === ownerId)
    .map(([, value]) => value);

export class InMemoryMemoryStore implements MemoryStore {
  readonly #memories = new Map<string, MemoryRecord>();
  readonly #nodes = new Map<string, KnowledgeNode>();
  readonly #edges = new Map<string, KnowledgeEdge>();
  readonly #decisions = new Map<string, EngineeringDecisionRecord>();
  readonly #repositoryMemory = new Map<string, RepositoryMemoryRecord>();
  readonly #agentMemory = new Map<string, AgentMemoryRecord>();
  readonly #learningEvents = new Map<string, LearningEventRecord>();
  readonly #suggestions = new Map<string, MemorySuggestionRecord>();
  readonly #timeline = new Map<string, MemoryTimelineEvent>();

  saveMemory(memory: MemoryRecord) {
    const parsed = MemoryRecordSchema.parse(memory);
    this.#memories.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  findMemory(ownerId: string, memoryId: string) {
    const memory = this.#memories.get(scopedKey(ownerId, memoryId));
    return memory?.ownerId === ownerId ? structuredClone(memory) : undefined;
  }

  listMemories(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#memories, ownerId),
      "updatedAt",
      limit,
    );
  }

  searchMemories(ownerId: string, query: MemorySearchQuery) {
    const needle = query.q.toLowerCase();
    const scored = scopedValues(this.#memories, ownerId)
      .filter((memory) => !query.type || memory.memoryType === query.type)
      .filter(
        (memory) => !query.repositoryId || memory.repositoryId === query.repositoryId,
      )
      .filter((memory) => !query.agentId || memory.agentId === query.agentId)
      .filter((memory) => !needle || searchableText(memory).includes(needle))
      .sort((left, right) => {
        const rightScore = right.importance * right.confidence;
        const leftScore = left.importance * left.confidence;
        return rightScore - leftScore || right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, query.limit);
    return scored.map((memory) => structuredClone(memory));
  }

  saveKnowledgeNode(node: KnowledgeNode) {
    const parsed = KnowledgeNodeSchema.parse(node);
    this.#nodes.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listKnowledgeNodes(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#nodes, ownerId),
      "updatedAt",
      limit,
    );
  }

  saveKnowledgeEdge(edge: KnowledgeEdge) {
    const parsed = KnowledgeEdgeSchema.parse(edge);
    this.#edges.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listKnowledgeEdges(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#edges, ownerId),
      "createdAt",
      limit,
    );
  }

  saveDecision(decision: EngineeringDecisionRecord) {
    const parsed = EngineeringDecisionRecordSchema.parse(decision);
    this.#decisions.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listDecisions(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#decisions, ownerId),
      "createdAt",
      limit,
    );
  }

  saveRepositoryMemory(memory: RepositoryMemoryRecord) {
    const parsed = RepositoryMemoryRecordSchema.parse(memory);
    this.#repositoryMemory.set(
      scopedKey(parsed.ownerId, parsed.repositoryId),
      structuredClone(parsed),
    );
  }

  getRepositoryMemory(ownerId: string, repositoryId: string) {
    const memory = this.#repositoryMemory.get(scopedKey(ownerId, repositoryId));
    return memory ? structuredClone(memory) : undefined;
  }

  saveAgentMemory(memory: AgentMemoryRecord) {
    const parsed = AgentMemoryRecordSchema.parse(memory);
    this.#agentMemory.set(
      scopedKey(parsed.ownerId, parsed.agentId),
      structuredClone(parsed),
    );
  }

  getAgentMemory(ownerId: string, agentId: string) {
    const memory = this.#agentMemory.get(scopedKey(ownerId, agentId));
    return memory ? structuredClone(memory) : undefined;
  }

  saveLearningEvent(event: LearningEventRecord) {
    const parsed = LearningEventRecordSchema.parse(event);
    this.#learningEvents.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listLearningEvents(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#learningEvents, ownerId),
      "createdAt",
      limit,
    );
  }

  saveSuggestion(suggestion: MemorySuggestionRecord) {
    const parsed = MemorySuggestionRecordSchema.parse(suggestion);
    this.#suggestions.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listSuggestions(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#suggestions, ownerId),
      "createdAt",
      limit,
    );
  }

  saveTimelineEvent(event: MemoryTimelineEvent) {
    const parsed = MemoryTimelineEventSchema.parse(event);
    this.#timeline.set(scopedKey(parsed.ownerId, parsed.id), structuredClone(parsed));
  }

  listTimeline(ownerId: string, limit: number) {
    return descending(
      scopedValues(this.#timeline, ownerId),
      "occurredAt",
      limit,
    );
  }
}
