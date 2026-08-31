import { ExecutiveAlertSchema, ExecutiveDecisionSchema, ExecutiveGoalSchema, ExecutiveHistorySchema, ExecutiveKpiSchema, ExecutiveObjectiveSchema, ExecutivePlanSchema, ExecutiveRiskSchema, ObjectiveCapabilityLinkSchema, ObjectiveEventSchema, ObjectiveExecutionSchema, ObjectiveMetricObservationSchema, ObjectiveProjectSchema, ExperimentSchema, ExperimentVariantSchema, ExperimentAssignmentSchema, ExperimentObservationSchema, ExperimentAllocationEventSchema, ExperimentResultSchema, ExperimentTimelineEventSchema, type ExecutiveAlert, type ExecutiveDecision, type ExecutiveGoal, type ExecutiveHistory, type ExecutiveKpi, type ExecutiveObjective, type ExecutivePlan, type ExecutiveRisk, type ObjectiveCapabilityLink, type ObjectiveEvent, type ObjectiveExecution, type ObjectiveMetricObservation, type ObjectiveProject, type Experiment, type ExperimentVariant, type ExperimentAssignment, type ExperimentObservation, type ExperimentAllocationEvent, type ExperimentResult, type ExperimentTimelineEvent } from "@alexa-control/shared";
import type { Pool } from "pg";
import type { ExecutiveStore } from "./store.js";
import { companyScope } from "../companies/scope.js";
const list = async <T>(pool: Pool, ownerId: string, kind: string, schema: { parse(value: unknown): T }) => {
  const companyId=companyScope.companyId(ownerId);
  const query=companyId
    ? await pool.query<{record:unknown}>("SELECT record FROM executive_records WHERE owner_id=$1 AND company_id=$2 AND kind=$3 ORDER BY updated_at DESC",[ownerId,companyId,kind])
    : await pool.query<{record:unknown}>("SELECT record FROM executive_records WHERE owner_id=$1 AND kind=$2 ORDER BY updated_at DESC",[ownerId,kind]);
  return query.rows.map((row)=>schema.parse(row.record));
};
const save = async (pool: Pool, kind: string, record: { id: string; ownerId: string }, updatedAt: string) => {
  const companyId=companyScope.companyId(record.ownerId);
  await pool.query("INSERT INTO executive_records(id,owner_id,company_id,kind,updated_at,record) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET record=EXCLUDED.record,updated_at=EXCLUDED.updated_at WHERE executive_records.owner_id=EXCLUDED.owner_id AND executive_records.company_id=EXCLUDED.company_id",[record.id,record.ownerId,companyId ?? null,kind,updatedAt,record]);
};
export class PostgresExecutiveStore implements ExecutiveStore {
  constructor(readonly pool: Pool) {}
  async saveGoal(value: ExecutiveGoal) { const v=ExecutiveGoalSchema.parse(value); await save(this.pool,"GOAL",v,v.updatedAt); } listGoals(ownerId: string) { return list(this.pool, ownerId, "GOAL", ExecutiveGoalSchema); }
  async saveKpi(value: ExecutiveKpi) { const v=ExecutiveKpiSchema.parse(value); await save(this.pool,"KPI",v,v.updatedAt); } listKpis(ownerId: string) { return list(this.pool, ownerId, "KPI", ExecutiveKpiSchema); }
  async saveObjective(value: ExecutiveObjective) { const v=ExecutiveObjectiveSchema.parse(value); await save(this.pool,"OBJECTIVE",v,v.updatedAt); } listObjectives(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE", ExecutiveObjectiveSchema); }
  async saveRisk(value: ExecutiveRisk) { const v=ExecutiveRiskSchema.parse(value); await save(this.pool,"RISK",v,v.updatedAt); } listRisks(ownerId: string) { return list(this.pool, ownerId, "RISK", ExecutiveRiskSchema); }
  async savePlan(value: ExecutivePlan) { const v=ExecutivePlanSchema.parse(value); await save(this.pool,"PLAN",v,v.updatedAt); } listPlans(ownerId: string) { return list(this.pool, ownerId, "PLAN", ExecutivePlanSchema); }
  async saveDecision(value: ExecutiveDecision) { const v=ExecutiveDecisionSchema.parse(value); await save(this.pool,"DECISION",v,v.updatedAt); } listDecisions(ownerId: string) { return list(this.pool, ownerId, "DECISION", ExecutiveDecisionSchema); }
  async saveHistory(value: ExecutiveHistory) { const v=ExecutiveHistorySchema.parse(value); await save(this.pool,"HISTORY",v,v.createdAt); } listHistory(ownerId: string) { return list(this.pool, ownerId, "HISTORY", ExecutiveHistorySchema); }
  async saveAlert(value: ExecutiveAlert) { const v=ExecutiveAlertSchema.parse(value); await save(this.pool,"ALERT",v,v.updatedAt); } listAlerts(ownerId: string) { return list(this.pool, ownerId, "ALERT", ExecutiveAlertSchema); }
  async saveObjectiveExecution(value: ObjectiveExecution) { const v=ObjectiveExecutionSchema.parse(value); await save(this.pool,"OBJECTIVE_EXECUTION",v,v.updatedAt); }
  async findObjectiveExecution(ownerId: string,id:string) { return (await this.listObjectiveExecutions(ownerId)).find((value)=>value.id===id); }
  listObjectiveExecutions(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE_EXECUTION", ObjectiveExecutionSchema); }
  async saveObjectiveProject(value: ObjectiveProject) { const v=ObjectiveProjectSchema.parse(value); await save(this.pool,"OBJECTIVE_PROJECT",v,v.updatedAt); }
  listObjectiveProjects(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE_PROJECT", ObjectiveProjectSchema); }
  async saveObjectiveEvent(value: ObjectiveEvent) { const v=ObjectiveEventSchema.parse(value); await save(this.pool,"OBJECTIVE_EVENT",v,v.createdAt); }
  listObjectiveEvents(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE_EVENT", ObjectiveEventSchema); }
  async saveObjectiveCapabilityLink(value: ObjectiveCapabilityLink) { const v=ObjectiveCapabilityLinkSchema.parse(value); await save(this.pool,"OBJECTIVE_CAPABILITY_LINK",v,v.updatedAt); }
  listObjectiveCapabilityLinks(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE_CAPABILITY_LINK", ObjectiveCapabilityLinkSchema); }
  async saveObjectiveMetricObservation(value: ObjectiveMetricObservation) { const v=ObjectiveMetricObservationSchema.parse(value); await save(this.pool,"OBJECTIVE_METRIC_OBSERVATION",v,v.observedAt); }
  listObjectiveMetricObservations(ownerId: string) { return list(this.pool, ownerId, "OBJECTIVE_METRIC_OBSERVATION", ObjectiveMetricObservationSchema); }
  async saveExperiment(value:Experiment){const v=ExperimentSchema.parse(value);await save(this.pool,"EXPERIMENT",v,v.updatedAt);} listExperiments(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT",ExperimentSchema);}
  async saveExperimentVariant(value:ExperimentVariant){const v=ExperimentVariantSchema.parse(value);await save(this.pool,"EXPERIMENT_VARIANT",v,v.updatedAt);} listExperimentVariants(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_VARIANT",ExperimentVariantSchema);}
  async saveExperimentAssignment(value:ExperimentAssignment){const v=ExperimentAssignmentSchema.parse(value);await save(this.pool,"EXPERIMENT_ASSIGNMENT",v,v.assignedAt);} listExperimentAssignments(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_ASSIGNMENT",ExperimentAssignmentSchema);}
  async saveExperimentObservation(value:ExperimentObservation){const v=ExperimentObservationSchema.parse(value);await save(this.pool,"EXPERIMENT_OBSERVATION",v,v.observedAt);} listExperimentObservations(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_OBSERVATION",ExperimentObservationSchema);}
  async saveExperimentAllocation(value:ExperimentAllocationEvent){const v=ExperimentAllocationEventSchema.parse(value);await save(this.pool,"EXPERIMENT_ALLOCATION",v,v.createdAt);} listExperimentAllocations(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_ALLOCATION",ExperimentAllocationEventSchema);}
  async saveExperimentResult(value:ExperimentResult){const v=ExperimentResultSchema.parse(value);await save(this.pool,"EXPERIMENT_RESULT",v,v.createdAt);} listExperimentResults(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_RESULT",ExperimentResultSchema);}
  async saveExperimentTimeline(value:ExperimentTimelineEvent){const v=ExperimentTimelineEventSchema.parse(value);await save(this.pool,"EXPERIMENT_TIMELINE",v,v.createdAt);} listExperimentTimeline(ownerId:string){return list(this.pool,ownerId,"EXPERIMENT_TIMELINE",ExperimentTimelineEventSchema);}
}
