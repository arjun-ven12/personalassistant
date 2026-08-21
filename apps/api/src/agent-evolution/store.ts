import {
  BenchmarkResultRecordSchema,
  CapabilityMarketplaceRecordSchema,
  EvolutionProposalRecordSchema,
  EvolutionRecordSchema,
  EvolutionTimelineRecordSchema,
  ExpertiseHistoryRecordSchema,
  ImprovementRecordSchema,
  OutcomeHistoryRecordSchema,
  SelfEvaluationRecordSchema,
  VersionRecordSchema,
  type BenchmarkResultRecord,
  type CapabilityMarketplaceRecord,
  type EvolutionProposalRecord,
  type EvolutionTimelineRecord,
  type ExpertiseHistoryRecord,
  type ExpertiseRecord,
  type ImprovementRecord,
  type OutcomeHistoryRecord,
  type SelfEvaluationRecord,
  type VersionRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AgentEvolutionStore {
  saveExpertise(record: ExpertiseRecord): Awaitable<void>;
  listExpertise(ownerId: string): Awaitable<ExpertiseRecord[]>;
  saveExpertiseHistory(record: ExpertiseHistoryRecord): Awaitable<void>;
  listExpertiseHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<ExpertiseHistoryRecord[]>;
  saveProposal(record: EvolutionProposalRecord): Awaitable<void>;
  listProposals(ownerId: string, limit: number): Awaitable<EvolutionProposalRecord[]>;
  saveVersion(record: VersionRecord): Awaitable<void>;
  listVersions(
    ownerId: string,
    subjectType: VersionRecord["subjectType"],
    limit: number,
  ): Awaitable<VersionRecord[]>;
  saveImprovement(record: ImprovementRecord): Awaitable<void>;
  listImprovements(
    ownerId: string,
    area: ImprovementRecord["area"],
    limit: number,
  ): Awaitable<ImprovementRecord[]>;
  saveOutcome(record: OutcomeHistoryRecord): Awaitable<void>;
  listOutcomes(
    ownerId: string,
    outcomeType: OutcomeHistoryRecord["outcomeType"],
    limit: number,
  ): Awaitable<OutcomeHistoryRecord[]>;
  saveBenchmark(record: BenchmarkResultRecord): Awaitable<void>;
  listBenchmarks(ownerId: string, limit: number): Awaitable<BenchmarkResultRecord[]>;
  saveTimeline(record: EvolutionTimelineRecord): Awaitable<void>;
  listTimeline(ownerId: string, limit: number): Awaitable<EvolutionTimelineRecord[]>;
  saveSelfEvaluation(record: SelfEvaluationRecord): Awaitable<void>;
  listSelfEvaluations(
    ownerId: string,
    limit: number,
  ): Awaitable<SelfEvaluationRecord[]>;
  saveMarketplace(record: CapabilityMarketplaceRecord): Awaitable<void>;
  listMarketplace(ownerId: string): Awaitable<CapabilityMarketplaceRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map((item) => clone(item));

export class InMemoryAgentEvolutionStore implements AgentEvolutionStore {
  readonly #expertise = new Map<string, ExpertiseRecord>();
  readonly #expertiseHistory = new Map<string, ExpertiseHistoryRecord>();
  readonly #proposals = new Map<string, EvolutionProposalRecord>();
  readonly #versions = new Map<string, VersionRecord>();
  readonly #improvements = new Map<string, ImprovementRecord>();
  readonly #outcomes = new Map<string, OutcomeHistoryRecord>();
  readonly #benchmarks = new Map<string, BenchmarkResultRecord>();
  readonly #timeline = new Map<string, EvolutionTimelineRecord>();
  readonly #evaluations = new Map<string, SelfEvaluationRecord>();
  readonly #marketplace = new Map<string, CapabilityMarketplaceRecord>();

  saveExpertise(record: ExpertiseRecord) {
    const parsed = EvolutionRecordSchema.parse(record);
    this.#expertise.set(
      `${parsed.ownerId}:${parsed.agentId}:${parsed.category}:${parsed.name}`,
      clone(parsed),
    );
  }

  listExpertise(ownerId: string) {
    return [...this.#expertise.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => clone(item));
  }

  saveExpertiseHistory(record: ExpertiseHistoryRecord) {
    const parsed = ExpertiseHistoryRecordSchema.parse(record);
    this.#expertiseHistory.set(parsed.id, clone(parsed));
  }

  listExpertiseHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#expertiseHistory.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveProposal(record: EvolutionProposalRecord) {
    const parsed = EvolutionProposalRecordSchema.parse(record);
    this.#proposals.set(parsed.id, clone(parsed));
  }

  listProposals(ownerId: string, limit: number) {
    return ordered(
      [...this.#proposals.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveVersion(record: VersionRecord) {
    const parsed = VersionRecordSchema.parse(record);
    this.#versions.set(parsed.id, clone(parsed));
  }

  listVersions(
    ownerId: string,
    subjectType: VersionRecord["subjectType"],
    limit: number,
  ) {
    return ordered(
      [...this.#versions.values()].filter(
        (item) => item.ownerId === ownerId && item.subjectType === subjectType,
      ),
      "createdAt",
      limit,
    );
  }

  saveImprovement(record: ImprovementRecord) {
    const parsed = ImprovementRecordSchema.parse(record);
    this.#improvements.set(parsed.id, clone(parsed));
  }

  listImprovements(ownerId: string, area: ImprovementRecord["area"], limit: number) {
    return ordered(
      [...this.#improvements.values()].filter(
        (item) => item.ownerId === ownerId && item.area === area,
      ),
      "createdAt",
      limit,
    );
  }

  saveOutcome(record: OutcomeHistoryRecord) {
    const parsed = OutcomeHistoryRecordSchema.parse(record);
    this.#outcomes.set(parsed.id, clone(parsed));
  }

  listOutcomes(
    ownerId: string,
    outcomeType: OutcomeHistoryRecord["outcomeType"],
    limit: number,
  ) {
    return ordered(
      [...this.#outcomes.values()].filter(
        (item) => item.ownerId === ownerId && item.outcomeType === outcomeType,
      ),
      "createdAt",
      limit,
    );
  }

  saveBenchmark(record: BenchmarkResultRecord) {
    const parsed = BenchmarkResultRecordSchema.parse(record);
    this.#benchmarks.set(parsed.id, clone(parsed));
  }

  listBenchmarks(ownerId: string, limit: number) {
    return ordered(
      [...this.#benchmarks.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveTimeline(record: EvolutionTimelineRecord) {
    const parsed = EvolutionTimelineRecordSchema.parse(record);
    this.#timeline.set(parsed.id, clone(parsed));
  }

  listTimeline(ownerId: string, limit: number) {
    return ordered(
      [...this.#timeline.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }

  saveSelfEvaluation(record: SelfEvaluationRecord) {
    const parsed = SelfEvaluationRecordSchema.parse(record);
    this.#evaluations.set(parsed.id, clone(parsed));
  }

  listSelfEvaluations(ownerId: string, limit: number) {
    return ordered(
      [...this.#evaluations.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveMarketplace(record: CapabilityMarketplaceRecord) {
    const parsed = CapabilityMarketplaceRecordSchema.parse(record);
    this.#marketplace.set(`${parsed.ownerId}:${parsed.id}`, clone(parsed));
  }

  listMarketplace(ownerId: string) {
    return [...this.#marketplace.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => clone(item));
  }
}
