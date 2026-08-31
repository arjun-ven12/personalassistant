import {
  ExecutiveAlertSchema, ExecutiveDecisionSchema, ExecutiveGoalSchema, ExecutiveHistorySchema, ExecutiveKpiSchema, ExecutiveObjectiveSchema, ExecutivePlanSchema, ExecutiveRiskSchema,
  ObjectiveCapabilityLinkSchema, ObjectiveEventSchema, ObjectiveExecutionSchema, ObjectiveMetricObservationSchema, ObjectiveProjectSchema,
  ExperimentSchema, ExperimentVariantSchema, ExperimentAssignmentSchema, ExperimentObservationSchema, ExperimentAllocationEventSchema, ExperimentResultSchema, ExperimentTimelineEventSchema,
  type ExecutiveAlert, type ExecutiveDecision, type ExecutiveGoal, type ExecutiveHistory, type ExecutiveKpi, type ExecutiveObjective, type ExecutivePlan, type ExecutiveRisk,
  type ObjectiveCapabilityLink, type ObjectiveEvent, type ObjectiveExecution, type ObjectiveMetricObservation, type ObjectiveProject,
  type Experiment, type ExperimentVariant, type ExperimentAssignment, type ExperimentObservation, type ExperimentAllocationEvent, type ExperimentResult, type ExperimentTimelineEvent,
} from "@alexa-control/shared";
import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

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
  private key(ownerId: string, id: string) { return `${companyScope.companyId(ownerId) ?? "legacy"}:${id}`; }
  private save<T extends {id:string;ownerId:string}>(map:Map<string,T>,value:T,schema:{parse(input:unknown):T}) { map.set(this.key(value.ownerId,value.id),clone(schema.parse(value))); }
  private list<T extends {ownerId:string}>(map:Map<string,T>,ownerId:string) { const companyId=companyScope.companyId(ownerId); return [...map.entries()].filter(([key,value])=>value.ownerId===ownerId&&(!companyId||key.startsWith(`${companyId}:`))).map(([,value])=>clone(value)); }
  saveGoal(value: ExecutiveGoal) { this.save(this.#goals,value,ExecutiveGoalSchema); } listGoals(ownerId:string){return this.list(this.#goals,ownerId);}
  saveKpi(value: ExecutiveKpi) { this.save(this.#kpis,value,ExecutiveKpiSchema); } listKpis(ownerId:string){return this.list(this.#kpis,ownerId);}
  saveObjective(value: ExecutiveObjective) { this.save(this.#objectives,value,ExecutiveObjectiveSchema); } listObjectives(ownerId:string){return this.list(this.#objectives,ownerId);}
  saveRisk(value: ExecutiveRisk) { this.save(this.#risks,value,ExecutiveRiskSchema); } listRisks(ownerId:string){return this.list(this.#risks,ownerId);}
  savePlan(value: ExecutivePlan) { this.save(this.#plans,value,ExecutivePlanSchema); } listPlans(ownerId:string){return this.list(this.#plans,ownerId);}
  saveDecision(value: ExecutiveDecision) { this.save(this.#decisions,value,ExecutiveDecisionSchema); } listDecisions(ownerId:string){return this.list(this.#decisions,ownerId);}
  saveHistory(value: ExecutiveHistory) { this.save(this.#history,value,ExecutiveHistorySchema); } listHistory(ownerId:string){return this.list(this.#history,ownerId);}
  saveAlert(value: ExecutiveAlert) { this.save(this.#alerts,value,ExecutiveAlertSchema); } listAlerts(ownerId:string){return this.list(this.#alerts,ownerId);}
  saveObjectiveExecution(value: ObjectiveExecution) { this.save(this.#objectiveExecutions,value,ObjectiveExecutionSchema); }
  findObjectiveExecution(ownerId:string,id:string){return this.list(this.#objectiveExecutions,ownerId).find((value)=>value.id===id);}
  listObjectiveExecutions(ownerId:string){return this.list(this.#objectiveExecutions,ownerId);}
  saveObjectiveProject(value:ObjectiveProject){this.save(this.#objectiveProjects,value,ObjectiveProjectSchema);} listObjectiveProjects(ownerId:string){return this.list(this.#objectiveProjects,ownerId);}
  saveObjectiveEvent(value:ObjectiveEvent){this.save(this.#objectiveEvents,value,ObjectiveEventSchema);} listObjectiveEvents(ownerId:string){return this.list(this.#objectiveEvents,ownerId);}
  saveObjectiveCapabilityLink(value:ObjectiveCapabilityLink){this.save(this.#objectiveCapabilityLinks,value,ObjectiveCapabilityLinkSchema);} listObjectiveCapabilityLinks(ownerId:string){return this.list(this.#objectiveCapabilityLinks,ownerId);}
  saveObjectiveMetricObservation(value:ObjectiveMetricObservation){this.save(this.#objectiveMetricObservations,value,ObjectiveMetricObservationSchema);} listObjectiveMetricObservations(ownerId:string){return this.list(this.#objectiveMetricObservations,ownerId);}
  saveExperiment(value:Experiment){this.save(this.#experiments,value,ExperimentSchema);} listExperiments(ownerId:string){return this.list(this.#experiments,ownerId);}
  saveExperimentVariant(value:ExperimentVariant){this.save(this.#experimentVariants,value,ExperimentVariantSchema);} listExperimentVariants(ownerId:string){return this.list(this.#experimentVariants,ownerId);}
  saveExperimentAssignment(value:ExperimentAssignment){this.save(this.#experimentAssignments,value,ExperimentAssignmentSchema);} listExperimentAssignments(ownerId:string){return this.list(this.#experimentAssignments,ownerId);}
  saveExperimentObservation(value:ExperimentObservation){this.save(this.#experimentObservations,value,ExperimentObservationSchema);} listExperimentObservations(ownerId:string){return this.list(this.#experimentObservations,ownerId);}
  saveExperimentAllocation(value:ExperimentAllocationEvent){this.save(this.#experimentAllocations,value,ExperimentAllocationEventSchema);} listExperimentAllocations(ownerId:string){return this.list(this.#experimentAllocations,ownerId);}
  saveExperimentResult(value:ExperimentResult){this.save(this.#experimentResults,value,ExperimentResultSchema);} listExperimentResults(ownerId:string){return this.list(this.#experimentResults,ownerId);}
  saveExperimentTimeline(value:ExperimentTimelineEvent){this.save(this.#experimentTimeline,value,ExperimentTimelineEventSchema);} listExperimentTimeline(ownerId:string){return this.list(this.#experimentTimeline,ownerId);}
}
