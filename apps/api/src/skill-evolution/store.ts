import {
  SkillBenchmarkResultSchema,
  SkillDraftBenchmarkCaseResultSchema,
  SkillDraftBenchmarkRunSchema,
  SkillEvolutionCandidateSchema,
  SkillEvolutionEvaluationRecordSchema,
  SkillEvolutionEventSchema,
  SkillEvolutionSkillSchema,
  SkillEvolutionUsageRecordSchema,
  SkillValidationResultSchema,
  SkillVersionSchema,
  type SkillBenchmarkResult,
  type SkillDraftBenchmarkCaseResult,
  type SkillDraftBenchmarkRun,
  type SkillEvolutionCandidate,
  type SkillEvolutionEvaluationRecord,
  type SkillEvolutionEvent,
  type SkillEvolutionSkill,
  type SkillEvolutionUsageRecord,
  type SkillValidationResult,
  type SkillVersion,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface SkillEvolutionStore {
  saveCandidate(record: SkillEvolutionCandidate): Awaitable<void>;
  getCandidate(ownerId: string, id: string): Awaitable<SkillEvolutionCandidate | null>;
  listCandidates(ownerId: string, limit: number): Awaitable<SkillEvolutionCandidate[]>;
  saveSkill(record: SkillEvolutionSkill): Awaitable<void>;
  getSkill(ownerId: string, id: string): Awaitable<SkillEvolutionSkill | null>;
  listSkills(ownerId: string, limit: number): Awaitable<SkillEvolutionSkill[]>;
  saveVersion(record: SkillVersion): Awaitable<void>;
  getVersion(ownerId: string, id: string): Awaitable<SkillVersion | null>;
  listVersions(ownerId: string, limit: number): Awaitable<SkillVersion[]>;
  saveValidation(record: SkillValidationResult): Awaitable<void>;
  listValidations(ownerId: string, limit: number): Awaitable<SkillValidationResult[]>;
  saveBenchmark(record: SkillBenchmarkResult): Awaitable<void>;
  listBenchmarks(ownerId: string, limit: number): Awaitable<SkillBenchmarkResult[]>;
  saveEvaluation(record: SkillEvolutionEvaluationRecord): Awaitable<void>;
  listEvaluations(ownerId: string, limit: number): Awaitable<SkillEvolutionEvaluationRecord[]>;
  saveDraftBenchmarkRun(record: SkillDraftBenchmarkRun): Awaitable<void>;
  listDraftBenchmarkRuns(ownerId: string, limit: number): Awaitable<SkillDraftBenchmarkRun[]>;
  saveDraftBenchmarkCaseResult(record: SkillDraftBenchmarkCaseResult): Awaitable<void>;
  listDraftBenchmarkCaseResults(ownerId: string, limit: number): Awaitable<SkillDraftBenchmarkCaseResult[]>;
  saveUsage(record: SkillEvolutionUsageRecord): Awaitable<void>;
  listUsage(ownerId: string, limit: number): Awaitable<SkillEvolutionUsageRecord[]>;
  saveEvent(record: SkillEvolutionEvent): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<SkillEvolutionEvent[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemorySkillEvolutionStore implements SkillEvolutionStore {
  readonly #candidates = new Map<string, SkillEvolutionCandidate>();
  readonly #skills = new Map<string, SkillEvolutionSkill>();
  readonly #versions = new Map<string, SkillVersion>();
  readonly #validations = new Map<string, SkillValidationResult>();
  readonly #benchmarks = new Map<string, SkillBenchmarkResult>();
  readonly #evaluations = new Map<string, SkillEvolutionEvaluationRecord>();
  readonly #draftRuns = new Map<string, SkillDraftBenchmarkRun>();
  readonly #draftResults = new Map<string, SkillDraftBenchmarkCaseResult>();
  readonly #usage = new Map<string, SkillEvolutionUsageRecord>();
  readonly #events = new Map<string, SkillEvolutionEvent>();

  saveCandidate(record: SkillEvolutionCandidate) {
    const parsed = SkillEvolutionCandidateSchema.parse(record);
    this.#candidates.set(parsed.id, clone(parsed));
  }
  getCandidate(ownerId: string, id: string) {
    const record = this.#candidates.get(id);
    return record?.ownerId === ownerId ? clone(record) : null;
  }
  listCandidates(ownerId: string, limit: number) {
    return ordered(
      [...this.#candidates.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSkill(record: SkillEvolutionSkill) {
    const parsed = SkillEvolutionSkillSchema.parse(record);
    this.#skills.set(parsed.id, clone(parsed));
  }
  getSkill(ownerId: string, id: string) {
    const record = this.#skills.get(id);
    return record?.ownerId === ownerId ? clone(record) : null;
  }
  listSkills(ownerId: string, limit: number) {
    return ordered(
      [...this.#skills.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVersion(record: SkillVersion) {
    const parsed = SkillVersionSchema.parse(record);
    if (this.#versions.has(parsed.id)) return;
    this.#versions.set(parsed.id, clone(parsed));
  }
  getVersion(ownerId: string, id: string) {
    const record = this.#versions.get(id);
    return record?.ownerId === ownerId ? clone(record) : null;
  }
  listVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveValidation(record: SkillValidationResult) {
    const parsed = SkillValidationResultSchema.parse(record);
    this.#validations.set(parsed.id, clone(parsed));
  }
  listValidations(ownerId: string, limit: number) {
    return ordered(
      [...this.#validations.values()].filter((item) => item.ownerId === ownerId),
      "validatedAt",
      limit,
    );
  }
  saveBenchmark(record: SkillBenchmarkResult) {
    const parsed = SkillBenchmarkResultSchema.parse(record);
    this.#benchmarks.set(parsed.id, clone(parsed));
  }
  listBenchmarks(ownerId: string, limit: number) {
    return ordered(
      [...this.#benchmarks.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveEvaluation(record: SkillEvolutionEvaluationRecord) {
    const parsed = SkillEvolutionEvaluationRecordSchema.parse(record);
    this.#evaluations.set(parsed.id, clone(parsed));
  }
  listEvaluations(ownerId: string, limit: number) {
    return ordered(
      [...this.#evaluations.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDraftBenchmarkRun(record: SkillDraftBenchmarkRun) {
    const parsed = SkillDraftBenchmarkRunSchema.parse(record);
    this.#draftRuns.set(parsed.id, clone(parsed));
  }
  listDraftBenchmarkRuns(ownerId: string, limit: number) {
    return ordered(
      [...this.#draftRuns.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDraftBenchmarkCaseResult(record: SkillDraftBenchmarkCaseResult) {
    const parsed = SkillDraftBenchmarkCaseResultSchema.parse(record);
    this.#draftResults.set(parsed.id, clone(parsed));
  }
  listDraftBenchmarkCaseResults(ownerId: string, limit: number) {
    return ordered(
      [...this.#draftResults.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveUsage(record: SkillEvolutionUsageRecord) {
    const parsed = SkillEvolutionUsageRecordSchema.parse(record);
    this.#usage.set(parsed.id, clone(parsed));
  }
  listUsage(ownerId: string, limit: number) {
    return ordered(
      [...this.#usage.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveEvent(record: SkillEvolutionEvent) {
    const parsed = SkillEvolutionEventSchema.parse(record);
    this.#events.set(parsed.id, clone(parsed));
  }
  listEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}
