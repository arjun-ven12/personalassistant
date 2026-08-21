import {
  ExecutiveAlertSchema, ExecutiveDecisionSchema, ExecutiveGoalSchema, ExecutiveHistorySchema, ExecutiveKpiSchema, ExecutiveObjectiveSchema, ExecutivePlanSchema, ExecutiveRiskSchema,
  type ExecutiveAlert, type ExecutiveDecision, type ExecutiveGoal, type ExecutiveHistory, type ExecutiveKpi, type ExecutiveObjective, type ExecutivePlan, type ExecutiveRisk,
} from "@alexa-control/shared";
import type { Awaitable } from "../identity/store.js";

export interface ExecutiveStore {
  saveGoal(value: ExecutiveGoal): Awaitable<void>; listGoals(ownerId: string): Awaitable<ExecutiveGoal[]>;
  saveKpi(value: ExecutiveKpi): Awaitable<void>; listKpis(ownerId: string): Awaitable<ExecutiveKpi[]>;
  saveObjective(value: ExecutiveObjective): Awaitable<void>; listObjectives(ownerId: string): Awaitable<ExecutiveObjective[]>;
  saveRisk(value: ExecutiveRisk): Awaitable<void>; listRisks(ownerId: string): Awaitable<ExecutiveRisk[]>;
  savePlan(value: ExecutivePlan): Awaitable<void>; listPlans(ownerId: string): Awaitable<ExecutivePlan[]>;
  saveDecision(value: ExecutiveDecision): Awaitable<void>; listDecisions(ownerId: string): Awaitable<ExecutiveDecision[]>;
  saveHistory(value: ExecutiveHistory): Awaitable<void>; listHistory(ownerId: string): Awaitable<ExecutiveHistory[]>;
  saveAlert(value: ExecutiveAlert): Awaitable<void>; listAlerts(ownerId: string): Awaitable<ExecutiveAlert[]>;
}
const clone = <T>(value: T): T => structuredClone(value);
export class InMemoryExecutiveStore implements ExecutiveStore {
  #goals = new Map<string, ExecutiveGoal>(); #kpis = new Map<string, ExecutiveKpi>(); #objectives = new Map<string, ExecutiveObjective>(); #risks = new Map<string, ExecutiveRisk>(); #plans = new Map<string, ExecutivePlan>(); #decisions = new Map<string, ExecutiveDecision>(); #history = new Map<string, ExecutiveHistory>(); #alerts = new Map<string, ExecutiveAlert>();
  saveGoal(value: ExecutiveGoal) { this.#goals.set(value.id, clone(ExecutiveGoalSchema.parse(value))); }
  listGoals(ownerId: string) { return [...this.#goals.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveKpi(value: ExecutiveKpi) { this.#kpis.set(value.id, clone(ExecutiveKpiSchema.parse(value))); }
  listKpis(ownerId: string) { return [...this.#kpis.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveObjective(value: ExecutiveObjective) { this.#objectives.set(value.id, clone(ExecutiveObjectiveSchema.parse(value))); }
  listObjectives(ownerId: string) { return [...this.#objectives.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveRisk(value: ExecutiveRisk) { this.#risks.set(value.id, clone(ExecutiveRiskSchema.parse(value))); }
  listRisks(ownerId: string) { return [...this.#risks.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  savePlan(value: ExecutivePlan) { this.#plans.set(value.id, clone(ExecutivePlanSchema.parse(value))); }
  listPlans(ownerId: string) { return [...this.#plans.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveDecision(value: ExecutiveDecision) { this.#decisions.set(value.id, clone(ExecutiveDecisionSchema.parse(value))); }
  listDecisions(ownerId: string) { return [...this.#decisions.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveHistory(value: ExecutiveHistory) { this.#history.set(value.id, clone(ExecutiveHistorySchema.parse(value))); }
  listHistory(ownerId: string) { return [...this.#history.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveAlert(value: ExecutiveAlert) { this.#alerts.set(value.id, clone(ExecutiveAlertSchema.parse(value))); }
  listAlerts(ownerId: string) { return [...this.#alerts.values()].filter((value) => value.ownerId === ownerId).map(clone); }
}
