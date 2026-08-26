import {
  ExecutiveAlertSchema, ExecutiveDecisionSchema, ExecutiveGoalSchema, ExecutiveHistorySchema, ExecutiveKpiSchema, ExecutiveObjectiveSchema, ExecutivePlanSchema, ExecutiveRiskSchema,
  ObjectiveCapabilityLinkSchema, ObjectiveEventSchema, ObjectiveExecutionSchema, ObjectiveMetricObservationSchema, ObjectiveProjectSchema,
  ExperimentSchema, ExperimentVariantSchema, ExperimentAssignmentSchema, ExperimentObservationSchema, ExperimentAllocationEventSchema, ExperimentResultSchema, ExperimentTimelineEventSchema,
  type ExecutiveAlert, type ExecutiveDecision, type ExecutiveGoal, type ExecutiveHistory, type ExecutiveKpi, type ExecutiveObjective, type ExecutivePlan, type ExecutiveRisk,
  type ObjectiveCapabilityLink, type ObjectiveEvent, type ObjectiveExecution, type ObjectiveMetricObservation, type ObjectiveProject,
  type Experiment, type ExperimentVariant, type ExperimentAssignment, type ExperimentObservation, type ExperimentAllocationEvent, type ExperimentResult, type ExperimentTimelineEvent,
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
  saveObjectiveExecution(value: ObjectiveExecution): Awaitable<void>; findObjectiveExecution(ownerId: string, id: string): Awaitable<ObjectiveExecution | undefined>; listObjectiveExecutions(ownerId: string): Awaitable<ObjectiveExecution[]>;
  saveObjectiveProject(value: ObjectiveProject): Awaitable<void>; listObjectiveProjects(ownerId: string): Awaitable<ObjectiveProject[]>;
  saveObjectiveEvent(value: ObjectiveEvent): Awaitable<void>; listObjectiveEvents(ownerId: string): Awaitable<ObjectiveEvent[]>;
  saveObjectiveCapabilityLink(value: ObjectiveCapabilityLink): Awaitable<void>; listObjectiveCapabilityLinks(ownerId: string): Awaitable<ObjectiveCapabilityLink[]>;
  saveObjectiveMetricObservation(value: ObjectiveMetricObservation): Awaitable<void>; listObjectiveMetricObservations(ownerId: string): Awaitable<ObjectiveMetricObservation[]>;
  saveExperiment(value: Experiment): Awaitable<void>; listExperiments(ownerId: string): Awaitable<Experiment[]>;
  saveExperimentVariant(value: ExperimentVariant): Awaitable<void>; listExperimentVariants(ownerId: string): Awaitable<ExperimentVariant[]>;
  saveExperimentAssignment(value: ExperimentAssignment): Awaitable<void>; listExperimentAssignments(ownerId: string): Awaitable<ExperimentAssignment[]>;
  saveExperimentObservation(value: ExperimentObservation): Awaitable<void>; listExperimentObservations(ownerId: string): Awaitable<ExperimentObservation[]>;
  saveExperimentAllocation(value: ExperimentAllocationEvent): Awaitable<void>; listExperimentAllocations(ownerId: string): Awaitable<ExperimentAllocationEvent[]>;
  saveExperimentResult(value: ExperimentResult): Awaitable<void>; listExperimentResults(ownerId: string): Awaitable<ExperimentResult[]>;
  saveExperimentTimeline(value: ExperimentTimelineEvent): Awaitable<void>; listExperimentTimeline(ownerId: string): Awaitable<ExperimentTimelineEvent[]>;
}
const clone = <T>(value: T): T => structuredClone(value);
export class InMemoryExecutiveStore implements ExecutiveStore {
  #goals = new Map<string, ExecutiveGoal>(); #kpis = new Map<string, ExecutiveKpi>(); #objectives = new Map<string, ExecutiveObjective>(); #risks = new Map<string, ExecutiveRisk>(); #plans = new Map<string, ExecutivePlan>(); #decisions = new Map<string, ExecutiveDecision>(); #history = new Map<string, ExecutiveHistory>(); #alerts = new Map<string, ExecutiveAlert>();
  #objectiveExecutions = new Map<string, ObjectiveExecution>(); #objectiveProjects = new Map<string, ObjectiveProject>(); #objectiveEvents = new Map<string, ObjectiveEvent>();
  #objectiveCapabilityLinks = new Map<string, ObjectiveCapabilityLink>(); #objectiveMetricObservations = new Map<string, ObjectiveMetricObservation>();
  #experiments=new Map<string,Experiment>(); #experimentVariants=new Map<string,ExperimentVariant>(); #experimentAssignments=new Map<string,ExperimentAssignment>(); #experimentObservations=new Map<string,ExperimentObservation>(); #experimentAllocations=new Map<string,ExperimentAllocationEvent>(); #experimentResults=new Map<string,ExperimentResult>(); #experimentTimeline=new Map<string,ExperimentTimelineEvent>();
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
  saveObjectiveExecution(value: ObjectiveExecution) { this.#objectiveExecutions.set(value.id, clone(ObjectiveExecutionSchema.parse(value))); }
  findObjectiveExecution(ownerId: string, id: string) { const value=this.#objectiveExecutions.get(id); return value?.ownerId===ownerId ? clone(value) : undefined; }
  listObjectiveExecutions(ownerId: string) { return [...this.#objectiveExecutions.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveObjectiveProject(value: ObjectiveProject) { this.#objectiveProjects.set(value.id, clone(ObjectiveProjectSchema.parse(value))); }
  listObjectiveProjects(ownerId: string) { return [...this.#objectiveProjects.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveObjectiveEvent(value: ObjectiveEvent) { this.#objectiveEvents.set(value.id, clone(ObjectiveEventSchema.parse(value))); }
  listObjectiveEvents(ownerId: string) { return [...this.#objectiveEvents.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveObjectiveCapabilityLink(value: ObjectiveCapabilityLink) { this.#objectiveCapabilityLinks.set(value.id, clone(ObjectiveCapabilityLinkSchema.parse(value))); }
  listObjectiveCapabilityLinks(ownerId: string) { return [...this.#objectiveCapabilityLinks.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveObjectiveMetricObservation(value: ObjectiveMetricObservation) { this.#objectiveMetricObservations.set(value.id, clone(ObjectiveMetricObservationSchema.parse(value))); }
  listObjectiveMetricObservations(ownerId: string) { return [...this.#objectiveMetricObservations.values()].filter((value) => value.ownerId === ownerId).map(clone); }
  saveExperiment(value:Experiment){this.#experiments.set(value.id,clone(ExperimentSchema.parse(value)));} listExperiments(ownerId:string){return [...this.#experiments.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentVariant(value:ExperimentVariant){this.#experimentVariants.set(value.id,clone(ExperimentVariantSchema.parse(value)));} listExperimentVariants(ownerId:string){return [...this.#experimentVariants.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentAssignment(value:ExperimentAssignment){this.#experimentAssignments.set(value.id,clone(ExperimentAssignmentSchema.parse(value)));} listExperimentAssignments(ownerId:string){return [...this.#experimentAssignments.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentObservation(value:ExperimentObservation){this.#experimentObservations.set(value.id,clone(ExperimentObservationSchema.parse(value)));} listExperimentObservations(ownerId:string){return [...this.#experimentObservations.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentAllocation(value:ExperimentAllocationEvent){this.#experimentAllocations.set(value.id,clone(ExperimentAllocationEventSchema.parse(value)));} listExperimentAllocations(ownerId:string){return [...this.#experimentAllocations.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentResult(value:ExperimentResult){this.#experimentResults.set(value.id,clone(ExperimentResultSchema.parse(value)));} listExperimentResults(ownerId:string){return [...this.#experimentResults.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
  saveExperimentTimeline(value:ExperimentTimelineEvent){this.#experimentTimeline.set(value.id,clone(ExperimentTimelineEventSchema.parse(value)));} listExperimentTimeline(ownerId:string){return [...this.#experimentTimeline.values()].filter((value)=>value.ownerId===ownerId).map(clone);}
}
