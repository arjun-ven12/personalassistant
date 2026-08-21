import {
  ArchitectureHealthRecordSchema,
  EngineeringGoalRecordSchema,
  EngineeringMetricsRecordSchema,
  EngineeringRiskRecordSchema,
  OpportunityRecordSchema,
  RecommendationRecordSchema,
  ReleaseAssessmentRecordSchema,
  RepositoryHealthRecordSchema,
  RoadmapRecordSchema,
  ScenarioSimulationResponseSchema,
  StrategicPlanRecordSchema,
  TechnicalDebtRecordSchema,
  type ArchitectureHealthRecord,
  type EngineeringGoalRecord,
  type EngineeringMetricsRecord,
  type EngineeringRiskRecord,
  type OpportunityRecord,
  type RecommendationRecord,
  type ReleaseAssessmentRecord,
  type RepositoryHealthRecord,
  type RoadmapRecord,
  type SimulationRunRecord,
  type StrategicPlanRecord,
  type TechnicalDebtRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface AdvisorStore {
  saveGoal(goal: EngineeringGoalRecord): Awaitable<void>;
  findGoal(
    ownerId: string,
    goalId: string,
  ): Awaitable<EngineeringGoalRecord | undefined>;
  listGoals(ownerId: string, limit: number): Awaitable<EngineeringGoalRecord[]>;
  saveStrategicPlan(plan: StrategicPlanRecord): Awaitable<void>;
  listStrategicPlans(ownerId: string, limit: number): Awaitable<StrategicPlanRecord[]>;
  saveTechnicalDebt(debt: TechnicalDebtRecord): Awaitable<void>;
  listTechnicalDebt(ownerId: string, limit: number): Awaitable<TechnicalDebtRecord[]>;
  saveRisk(risk: EngineeringRiskRecord): Awaitable<void>;
  listRisks(ownerId: string, limit: number): Awaitable<EngineeringRiskRecord[]>;
  saveRepositoryHealth(health: RepositoryHealthRecord): Awaitable<void>;
  listRepositoryHealth(
    ownerId: string,
    limit: number,
  ): Awaitable<RepositoryHealthRecord[]>;
  saveArchitectureHealth(health: ArchitectureHealthRecord): Awaitable<void>;
  listArchitectureHealth(
    ownerId: string,
    limit: number,
  ): Awaitable<ArchitectureHealthRecord[]>;
  saveRecommendation(recommendation: RecommendationRecord): Awaitable<void>;
  listRecommendations(
    ownerId: string,
    limit: number,
  ): Awaitable<RecommendationRecord[]>;
  saveOpportunity(opportunity: OpportunityRecord): Awaitable<void>;
  listOpportunities(ownerId: string, limit: number): Awaitable<OpportunityRecord[]>;
  saveRoadmap(roadmap: RoadmapRecord): Awaitable<void>;
  listRoadmaps(ownerId: string, limit: number): Awaitable<RoadmapRecord[]>;
  saveReleaseAssessment(assessment: ReleaseAssessmentRecord): Awaitable<void>;
  listReleaseAssessments(
    ownerId: string,
    limit: number,
  ): Awaitable<ReleaseAssessmentRecord[]>;
  saveSimulation(simulation: SimulationRunRecord): Awaitable<void>;
  listSimulations(ownerId: string, limit: number): Awaitable<SimulationRunRecord[]>;
  saveMetrics(metrics: EngineeringMetricsRecord): Awaitable<void>;
  latestMetrics(ownerId: string): Awaitable<EngineeringMetricsRecord | undefined>;
}

const clone = <T>(value: T): T => structuredClone(value);

const descending = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map((item) => clone(item));

export class InMemoryAdvisorStore implements AdvisorStore {
  readonly #goals = new Map<string, EngineeringGoalRecord>();
  readonly #plans = new Map<string, StrategicPlanRecord>();
  readonly #debt = new Map<string, TechnicalDebtRecord>();
  readonly #risks = new Map<string, EngineeringRiskRecord>();
  readonly #repositoryHealth = new Map<string, RepositoryHealthRecord>();
  readonly #architectureHealth = new Map<string, ArchitectureHealthRecord>();
  readonly #recommendations = new Map<string, RecommendationRecord>();
  readonly #opportunities = new Map<string, OpportunityRecord>();
  readonly #roadmaps = new Map<string, RoadmapRecord>();
  readonly #releaseAssessments = new Map<string, ReleaseAssessmentRecord>();
  readonly #simulations = new Map<string, SimulationRunRecord>();
  readonly #metrics = new Map<string, EngineeringMetricsRecord>();

  saveGoal(goal: EngineeringGoalRecord) {
    const parsed = EngineeringGoalRecordSchema.parse(goal);
    this.#goals.set(parsed.id, clone(parsed));
  }

  findGoal(ownerId: string, goalId: string) {
    const goal = this.#goals.get(goalId);
    return goal?.ownerId === ownerId ? clone(goal) : undefined;
  }

  listGoals(ownerId: string, limit: number) {
    return descending(
      [...this.#goals.values()].filter((goal) => goal.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveStrategicPlan(plan: StrategicPlanRecord) {
    const parsed = StrategicPlanRecordSchema.parse(plan);
    this.#plans.set(parsed.id, clone(parsed));
  }

  listStrategicPlans(ownerId: string, limit: number) {
    return descending(
      [...this.#plans.values()].filter((plan) => plan.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveTechnicalDebt(debt: TechnicalDebtRecord) {
    const parsed = TechnicalDebtRecordSchema.parse(debt);
    this.#debt.set(parsed.id, clone(parsed));
  }

  listTechnicalDebt(ownerId: string, limit: number) {
    return descending(
      [...this.#debt.values()].filter((debt) => debt.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveRisk(risk: EngineeringRiskRecord) {
    const parsed = EngineeringRiskRecordSchema.parse(risk);
    this.#risks.set(parsed.id, clone(parsed));
  }

  listRisks(ownerId: string, limit: number) {
    return descending(
      [...this.#risks.values()].filter((risk) => risk.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveRepositoryHealth(health: RepositoryHealthRecord) {
    const parsed = RepositoryHealthRecordSchema.parse(health);
    this.#repositoryHealth.set(parsed.id, clone(parsed));
  }

  listRepositoryHealth(ownerId: string, limit: number) {
    return descending(
      [...this.#repositoryHealth.values()].filter(
        (health) => health.ownerId === ownerId,
      ),
      "assessedAt",
      limit,
    );
  }

  saveArchitectureHealth(health: ArchitectureHealthRecord) {
    const parsed = ArchitectureHealthRecordSchema.parse(health);
    this.#architectureHealth.set(parsed.id, clone(parsed));
  }

  listArchitectureHealth(ownerId: string, limit: number) {
    return descending(
      [...this.#architectureHealth.values()].filter(
        (health) => health.ownerId === ownerId,
      ),
      "assessedAt",
      limit,
    );
  }

  saveRecommendation(recommendation: RecommendationRecord) {
    const parsed = RecommendationRecordSchema.parse(recommendation);
    this.#recommendations.set(parsed.id, clone(parsed));
  }

  listRecommendations(ownerId: string, limit: number) {
    return descending(
      [...this.#recommendations.values()].filter(
        (recommendation) => recommendation.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }

  saveOpportunity(opportunity: OpportunityRecord) {
    const parsed = OpportunityRecordSchema.parse(opportunity);
    this.#opportunities.set(parsed.id, clone(parsed));
  }

  listOpportunities(ownerId: string, limit: number) {
    return descending(
      [...this.#opportunities.values()].filter(
        (opportunity) => opportunity.ownerId === ownerId,
      ),
      "detectedAt",
      limit,
    );
  }

  saveRoadmap(roadmap: RoadmapRecord) {
    const parsed = RoadmapRecordSchema.parse(roadmap);
    this.#roadmaps.set(parsed.id, clone(parsed));
  }

  listRoadmaps(ownerId: string, limit: number) {
    return descending(
      [...this.#roadmaps.values()].filter((roadmap) => roadmap.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveReleaseAssessment(assessment: ReleaseAssessmentRecord) {
    const parsed = ReleaseAssessmentRecordSchema.parse(assessment);
    this.#releaseAssessments.set(parsed.id, clone(parsed));
  }

  listReleaseAssessments(ownerId: string, limit: number) {
    return descending(
      [...this.#releaseAssessments.values()].filter(
        (assessment) => assessment.ownerId === ownerId,
      ),
      "assessedAt",
      limit,
    );
  }

  saveSimulation(simulation: SimulationRunRecord) {
    const parsed = ScenarioSimulationResponseSchema.parse(simulation);
    this.#simulations.set(parsed.id, clone(parsed));
  }

  listSimulations(ownerId: string, limit: number) {
    return descending(
      [...this.#simulations.values()].filter(
        (simulation) => simulation.ownerId === ownerId,
      ),
      "createdAt",
      limit,
    );
  }

  saveMetrics(metrics: EngineeringMetricsRecord) {
    const parsed = EngineeringMetricsRecordSchema.parse(metrics);
    this.#metrics.set(parsed.id, clone(parsed));
  }

  latestMetrics(ownerId: string) {
    return descending(
      [...this.#metrics.values()].filter((metrics) => metrics.ownerId === ownerId),
      "recordedAt",
      1,
    )[0];
  }
}
