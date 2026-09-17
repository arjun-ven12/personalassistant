import {
  EngineeringArtifactSchema,
  EngineeringEventSchema,
  EngineeringObjectiveSchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
  type EngineeringArtifact,
  type EngineeringEvent,
  type EngineeringObjective,
  type EngineeringTask,
  type EngineeringTaskResult,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { EngineeringOrchestrationStore } from "./store.js";

const record = <T>(schema: { parse(value: unknown): T }, row: { record: unknown }) =>
  schema.parse(row.record);

export class PostgresEngineeringOrchestrationStore
  implements EngineeringOrchestrationStore
{
  constructor(readonly pool: Pool) {}

  async saveObjective(value: EngineeringObjective) {
    const item = EngineeringObjectiveSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_objectives(id,owner_id,company_id,repository_id,status,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE
       SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [item.id,item.ownerId,item.companyId,item.repositoryId,item.status,item.createdAt,item.updatedAt,item],
    );
  }


  async saveObjectiveIfVersion(value: EngineeringObjective, expectedVersion: number) {
    const item = EngineeringObjectiveSchema.parse(value);
    const result = await this.pool.query(
      `UPDATE engineering_objectives
       SET status=$5,updated_at=$6,record=$7
       WHERE owner_id=$1 AND company_id=$2 AND id=$3
       AND (record->>'version')::int=$4`,
      [
        item.ownerId,
        item.companyId,
        item.id,
        expectedVersion,
        item.status,
        item.updatedAt,
        item,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async findObjective(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_objectives WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, objectiveId],
    );
    return result.rows[0]
      ? record(EngineeringObjectiveSchema, result.rows[0])
      : undefined;
  }

  async listObjectives(ownerId: string, companyId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_objectives WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT $3",
      [ownerId, companyId, limit],
    );
    return result.rows.map((row) => record(EngineeringObjectiveSchema, row));
  }

  async saveTask(value: EngineeringTask) {
    const item = EngineeringTaskSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_objective_tasks(id,owner_id,company_id,objective_id,repository_id,status,lease_owner,lease_expires_at,lease_generation,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET
       status=EXCLUDED.status,lease_owner=EXCLUDED.lease_owner,lease_expires_at=EXCLUDED.lease_expires_at,
       lease_generation=EXCLUDED.lease_generation,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [item.id,item.ownerId,item.companyId,item.objectiveId,item.repositoryId,item.status,item.leaseOwner,item.leaseExpiresAt,item.leaseGeneration,item.createdAt,item.updatedAt,item],
    );
  }
  async saveTasks(tasks: EngineeringTask[]) {
    for (const task of tasks) await this.saveTask(task);
  }
  async findTask(ownerId: string, companyId: string, taskId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_objective_tasks WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, taskId],
    );
    return result.rows[0] ? record(EngineeringTaskSchema, result.rows[0]) : undefined;
  }
  async listTasks(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_objective_tasks WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3 ORDER BY created_at,id",
      [ownerId, companyId, objectiveId],
    );
    return result.rows.map((row) => record(EngineeringTaskSchema, row));
  }

  async acquireTaskLease(input: { ownerId: string; companyId: string; taskId: string; workerId: string; now: string; expiresAt: string }) {
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE engineering_objective_tasks SET
       status='ACTIVE',lease_owner=$4::text,lease_expires_at=$6::timestamptz,lease_generation=lease_generation+1,
       updated_at=$5::timestamptz,record=record || jsonb_build_object(
         'status','ACTIVE','leaseOwner',$4::text,'leaseExpiresAt',$8::text,
         'leaseGeneration',lease_generation+1,
         'attempt',(record->>'attempt')::int+1,
         'startedAt',COALESCE(record->'startedAt',to_jsonb($7::text)),
         'updatedAt',$7::text)
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND status='READY'
       AND (lease_owner IS NULL OR lease_expires_at <= $5::timestamptz)
       RETURNING record`,
      [
        input.ownerId,
        input.companyId,
        input.taskId,
        input.workerId,
        input.now,
        input.expiresAt,
        input.now,
        input.expiresAt,
      ],
    );
    return result.rows[0] ? record(EngineeringTaskSchema, result.rows[0]) : undefined;
  }

  async renewTaskLease(input: { ownerId: string; companyId: string; taskId: string; workerId: string; generation: number; now: string; expiresAt: string }) {
    const result = await this.pool.query(
      `UPDATE engineering_objective_tasks SET lease_expires_at=$7::timestamptz,updated_at=$6::timestamptz,
       record=jsonb_set(jsonb_set(record,'{leaseExpiresAt}',to_jsonb($8::text)),'{updatedAt}',to_jsonb($9::text))
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5
       AND lease_expires_at > $6::timestamptz`,
      [
        input.ownerId,
        input.companyId,
        input.taskId,
        input.workerId,
        input.generation,
        input.now,
        input.expiresAt,
        input.expiresAt,
        input.now,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async saveTaskFenced(task: EngineeringTask, workerId: string, generation: number, now: string) {
    const item = EngineeringTaskSchema.parse(task);
    const result = await this.pool.query(
      `UPDATE engineering_objective_tasks SET status=$6,updated_at=$7,record=$8
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5
       AND lease_expires_at > $9::timestamptz`,
      [item.ownerId,item.companyId,item.id,workerId,generation,item.status,item.updatedAt,item,now],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async releaseTaskLease(input: { ownerId: string; companyId: string; taskId: string; workerId: string; generation: number; now: string }) {
    const result = await this.pool.query(
      `UPDATE engineering_objective_tasks SET lease_owner=NULL,lease_expires_at=NULL,updated_at=$6::timestamptz,
       record=jsonb_set(jsonb_set(jsonb_set(record,'{leaseOwner}','null'),'{leaseExpiresAt}','null'),'{updatedAt}',to_jsonb($7::text))
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5
       AND lease_expires_at > $6::timestamptz`,
      [
        input.ownerId,
        input.companyId,
        input.taskId,
        input.workerId,
        input.generation,
        input.now,
        input.now,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async saveResult(value: EngineeringTaskResult) {
    const item = EngineeringTaskResultSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_task_results(id,owner_id,company_id,objective_id,task_id,completed_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,company_id,task_id) DO UPDATE SET completed_at=EXCLUDED.completed_at,record=EXCLUDED.record`,
      [item.id,item.ownerId,item.companyId,item.objectiveId,item.taskId,item.completedAt,item],
    );
  }
  async listResults(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM engineering_task_results WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3 ORDER BY completed_at",[ownerId,companyId,objectiveId]);
    return result.rows.map((row) => record(EngineeringTaskResultSchema,row));
  }
  async saveArtifact(value: EngineeringArtifact) {
    const item = EngineeringArtifactSchema.parse(value);
    await this.pool.query("INSERT INTO engineering_task_artifacts(id,owner_id,company_id,objective_id,task_id,created_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",[item.id,item.ownerId,item.companyId,item.objectiveId,item.taskId,item.createdAt,item]);
  }
  async listArtifacts(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM engineering_task_artifacts WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3 ORDER BY created_at",[ownerId,companyId,objectiveId]);
    return result.rows.map((row) => record(EngineeringArtifactSchema,row));
  }
  async saveEvent(value: EngineeringEvent) {
    const item = EngineeringEventSchema.parse(value);
    await this.pool.query("INSERT INTO engineering_orchestration_events(id,owner_id,company_id,objective_id,task_id,type,created_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING",[item.id,item.ownerId,item.companyId,item.objectiveId,item.taskId,item.type,item.createdAt,item]);
  }
  async listEvents(ownerId: string, companyId: string, objectiveId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM engineering_orchestration_events WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3 ORDER BY created_at LIMIT $4",[ownerId,companyId,objectiveId,limit]);
    return result.rows.map((row) => record(EngineeringEventSchema,row));
  }
}
