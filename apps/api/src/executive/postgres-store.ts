import { ExecutiveAlertSchema, ExecutiveDecisionSchema, ExecutiveGoalSchema, ExecutiveHistorySchema, ExecutiveKpiSchema, ExecutiveObjectiveSchema, ExecutivePlanSchema, ExecutiveRiskSchema, type ExecutiveAlert, type ExecutiveDecision, type ExecutiveGoal, type ExecutiveHistory, type ExecutiveKpi, type ExecutiveObjective, type ExecutivePlan, type ExecutiveRisk } from "@alexa-control/shared";
import type { Pool } from "pg";
import type { ExecutiveStore } from "./store.js";
const list = async <T>(pool: Pool, ownerId: string, kind: string, schema: { parse(value: unknown): T }) => (await pool.query<{ record: unknown }>("SELECT record FROM executive_records WHERE owner_id=$1 AND kind=$2 ORDER BY updated_at DESC", [ownerId, kind])).rows.map((row) => schema.parse(row.record));
const save = async (pool: Pool, kind: string, record: { id: string; ownerId: string }, updatedAt: string) => { await pool.query("INSERT INTO executive_records(id, owner_id, kind, updated_at, record) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET record=EXCLUDED.record, updated_at=EXCLUDED.updated_at", [record.id, record.ownerId, kind, updatedAt, record]); };
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
}
