import {
  AgentDecisionLogRecordSchema,
  CognitiveMemoryRecordSchema,
  CognitiveMetricsRecordSchema,
  CognitiveStateRecordSchema,
  ConfidenceRecordSchema,
  ExperienceRecordSchema,
  GoalTrackingRecordSchema,
  LearningPipelineEventRecordSchema,
  MemoryConsolidationRecordSchema,
  MemoryRelationshipRecordSchema,
  ReflectionReportRecordSchema,
  SpecializationProfileRecordSchema,
  type AgentDecisionLogRecord,
  type CognitiveMemoryRecord,
  type CognitiveMetricsRecord,
  type CognitiveSearchQuery,
  type CognitiveStateRecord,
  type ConfidenceRecord,
  type ExperienceRecord,
  type GoalTrackingRecord,
  type LearningPipelineEventRecord,
  type MemoryConsolidationRecord,
  type MemoryRelationshipRecord,
  type ReflectionReportRecord,
  type SpecializationProfileRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AgentCognitionStore {
  saveMemory(memory: CognitiveMemoryRecord): Awaitable<void>;
  listMemory(
    ownerId: string,
    kind: CognitiveMemoryRecord["kind"],
    limit: number,
  ): Awaitable<CognitiveMemoryRecord[]>;
  searchMemory(
    ownerId: string,
    query: CognitiveSearchQuery,
  ): Awaitable<CognitiveMemoryRecord[]>;
  saveRelationship(relationship: MemoryRelationshipRecord): Awaitable<void>;
  listRelationships(
    ownerId: string,
    limit: number,
  ): Awaitable<MemoryRelationshipRecord[]>;
  saveExperience(experience: ExperienceRecord): Awaitable<void>;
  listExperiences(ownerId: string, limit: number): Awaitable<ExperienceRecord[]>;
  saveDecision(decision: AgentDecisionLogRecord): Awaitable<void>;
  listDecisions(ownerId: string, limit: number): Awaitable<AgentDecisionLogRecord[]>;
  saveSpecialization(profile: SpecializationProfileRecord): Awaitable<void>;
  listSpecializations(ownerId: string): Awaitable<SpecializationProfileRecord[]>;
  saveReflection(reflection: ReflectionReportRecord): Awaitable<void>;
  listReflections(ownerId: string, limit: number): Awaitable<ReflectionReportRecord[]>;
  saveConfidence(confidence: ConfidenceRecord): Awaitable<void>;
  listConfidence(ownerId: string, limit: number): Awaitable<ConfidenceRecord[]>;
  saveGoal(goal: GoalTrackingRecord): Awaitable<void>;
  listGoals(ownerId: string, limit: number): Awaitable<GoalTrackingRecord[]>;
  saveState(state: CognitiveStateRecord): Awaitable<void>;
  listStates(ownerId: string): Awaitable<CognitiveStateRecord[]>;
  saveLearningEvent(event: LearningPipelineEventRecord): Awaitable<void>;
  listLearningEvents(
    ownerId: string,
    limit: number,
  ): Awaitable<LearningPipelineEventRecord[]>;
  saveConsolidation(record: MemoryConsolidationRecord): Awaitable<void>;
  listConsolidations(
    ownerId: string,
    limit: number,
  ): Awaitable<MemoryConsolidationRecord[]>;
  saveMetrics(metrics: CognitiveMetricsRecord): Awaitable<void>;
  listMetrics(ownerId: string): Awaitable<CognitiveMetricsRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);

const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map((item) => clone(item));

const memoryText = (memory: CognitiveMemoryRecord) =>
  [memory.title, memory.summary, memory.content, memory.tags.join(" ")]
    .join(" ")
    .toLowerCase();

export class InMemoryAgentCognitionStore implements AgentCognitionStore {
  readonly #memories = new Map<string, CognitiveMemoryRecord>();
  readonly #relationships = new Map<string, MemoryRelationshipRecord>();
  readonly #experiences = new Map<string, ExperienceRecord>();
  readonly #decisions = new Map<string, AgentDecisionLogRecord>();
  readonly #specializations = new Map<string, SpecializationProfileRecord>();
  readonly #reflections = new Map<string, ReflectionReportRecord>();
  readonly #confidence = new Map<string, ConfidenceRecord>();
  readonly #goals = new Map<string, GoalTrackingRecord>();
  readonly #states = new Map<string, CognitiveStateRecord>();
  readonly #learning = new Map<string, LearningPipelineEventRecord>();
  readonly #consolidations = new Map<string, MemoryConsolidationRecord>();
  readonly #metrics = new Map<string, CognitiveMetricsRecord>();

  saveMemory(memory: CognitiveMemoryRecord) {
    const parsed = CognitiveMemoryRecordSchema.parse(memory);
    this.#memories.set(parsed.id, clone(parsed));
  }

  listMemory(ownerId: string, kind: CognitiveMemoryRecord["kind"], limit: number) {
    return ordered(
      [...this.#memories.values()].filter(
        (memory) => memory.ownerId === ownerId && memory.kind === kind,
      ),
      "updatedAt",
      limit,
    );
  }

  searchMemory(ownerId: string, query: CognitiveSearchQuery) {
    const needle = query.q.toLowerCase();
    const memories = [...this.#memories.values()]
      .filter((memory) => memory.ownerId === ownerId)
      .filter((memory) => !query.agentId || memory.agentId === query.agentId)
      .filter((memory) => !query.kind || memory.kind === query.kind)
      .filter((memory) => !needle || memoryText(memory).includes(needle))
      .sort(
        (left, right) =>
          right.importance * right.confidence - left.importance * left.confidence ||
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, query.limit);
    return memories.map((memory) => clone(memory));
  }

  saveRelationship(relationship: MemoryRelationshipRecord) {
    const parsed = MemoryRelationshipRecordSchema.parse(relationship);
    this.#relationships.set(parsed.id, clone(parsed));
  }

  listRelationships(ownerId: string, limit: number) {
    return ordered(
      [...this.#relationships.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveExperience(experience: ExperienceRecord) {
    const parsed = ExperienceRecordSchema.parse(experience);
    this.#experiences.set(parsed.id, clone(parsed));
  }

  listExperiences(ownerId: string, limit: number) {
    return ordered(
      [...this.#experiences.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveDecision(decision: AgentDecisionLogRecord) {
    const parsed = AgentDecisionLogRecordSchema.parse(decision);
    this.#decisions.set(parsed.id, clone(parsed));
  }

  listDecisions(ownerId: string, limit: number) {
    return ordered(
      [...this.#decisions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveSpecialization(profile: SpecializationProfileRecord) {
    const parsed = SpecializationProfileRecordSchema.parse(profile);
    this.#specializations.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }

  listSpecializations(ownerId: string) {
    return [...this.#specializations.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => clone(item));
  }

  saveReflection(reflection: ReflectionReportRecord) {
    const parsed = ReflectionReportRecordSchema.parse(reflection);
    this.#reflections.set(parsed.id, clone(parsed));
  }

  listReflections(ownerId: string, limit: number) {
    return ordered(
      [...this.#reflections.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveConfidence(confidence: ConfidenceRecord) {
    const parsed = ConfidenceRecordSchema.parse(confidence);
    this.#confidence.set(parsed.id, clone(parsed));
  }

  listConfidence(ownerId: string, limit: number) {
    return ordered(
      [...this.#confidence.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveGoal(goal: GoalTrackingRecord) {
    const parsed = GoalTrackingRecordSchema.parse(goal);
    this.#goals.set(parsed.id, clone(parsed));
  }

  listGoals(ownerId: string, limit: number) {
    return ordered(
      [...this.#goals.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveState(state: CognitiveStateRecord) {
    const parsed = CognitiveStateRecordSchema.parse(state);
    this.#states.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }

  listStates(ownerId: string) {
    return [...this.#states.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => clone(item));
  }

  saveLearningEvent(event: LearningPipelineEventRecord) {
    const parsed = LearningPipelineEventRecordSchema.parse(event);
    this.#learning.set(parsed.id, clone(parsed));
  }

  listLearningEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#learning.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveConsolidation(record: MemoryConsolidationRecord) {
    const parsed = MemoryConsolidationRecordSchema.parse(record);
    this.#consolidations.set(parsed.id, clone(parsed));
  }

  listConsolidations(ownerId: string, limit: number) {
    return ordered(
      [...this.#consolidations.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveMetrics(metrics: CognitiveMetricsRecord) {
    const parsed = CognitiveMetricsRecordSchema.parse(metrics);
    this.#metrics.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }

  listMetrics(ownerId: string) {
    return [...this.#metrics.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => clone(item));
  }
}
